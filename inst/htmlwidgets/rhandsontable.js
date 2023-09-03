HTMLWidgets.widget({

  name: 'rhandsontable',

  type: 'output',

  params: null,

  initialize: function(el, width, height) {

    return {

    };

  },

  renderValue: function(el, x, instance) {

    // convert json to array
    if (x.data.length > 0 && x.data[0].constructor === Array) {
      x.data = x.data;
    } else {
      x.data = toArray(x.data.map(function(d) {
        return x.rColnames.map(function(ky) {
          return d[ky];
        });
      }));
    }

    if (x.isHeatmap === true) {
      x.afterLoadData = this.initHeatmap;
      x.beforeChangeRender = this.updateHeatmap;
    }

    if (x.overflow) {
      $("#" + el.id).css('overflow', x.overflow);
    }

    if (x.rowHeaderWidth) {
      $("#" + el.id).css('col.rowHeader', x.rowHeaderWidth + 'px');
    }

    // convert formulas engine from string to window object
    //  since no real way to do from R options
    if(x.formulas && typeof(x.formulas) === "object") {
      x.formulas.engine = window[x.formulas.engine];
    }

    // add ability for a user to specify options from JavaScript function
    if(x.hasOwnProperty('jsOptions') && typeof(x.jsOptions) === 'function') {
      x = Object.assign(x, x.jsOptions());
    }

    //this.afterRender(x);

    this.params = Object.assign({}, x, {formulas: undefined}); // remove formulas to prevent circular

    if (instance.hot) { // update existing instance
      if (x.debug && x.debug > 0) {
        console.log("rhandsontable: update table");
      }

      // try to preserve multi column sort order that now gets lost in handsontable 9
      //  get sort config applied before updating handsontable and add to params
      //  so we can use in hooks
      var sortconfig = [];
      if(x.multiColumnSorting === true) {
        try {
          sortconfig = instance.hot.getPlugin("multiColumnSorting").getSortConfig().slice(0);
          x._oldMultiColumnSort = sortconfig;
        } catch(e) {}
      }

      instance.hot.params = x;
      instance.hot.updateSettings(x);

    } else {  // create new instance
      if (x.debug && x.debug > 0) {
        console.log("rhandsontable: new table");
      }

      instance.hot = new Handsontable(el, x);

      this.afterChangeCallback(x);
      this.afterCellMetaCallback(x);
      this.afterRowAndColChange(x);

      if (x.selectCallback) {
        this.afterSelectCallback(x);
      }

      instance.hot.params = x;
      instance.hot.updateSettings(x);

      var searchField = document.getElementById('searchField');
      if (typeof(searchField) != 'undefined' && searchField != null) {
        Handsontable.dom.addEvent(searchField, 'keyup', function (event) {
          var queryResult = instance.hot.search.query(this.value);
          instance.hot.render();
        });
      }
    }
  },

  resize: function(el, width, height, instance) {

  },

  afterRender: function(x) {
    x.afterRender = function(isForced) {
      var plugin = this.getPlugin('autoColumnSize');
      if (plugin.isEnabled() && this.params) {
        if (this.params && this.params.debug) {
          if (this.params.debug > 0) {
            console.log("rhandsontable: resizing column widths");
          }
        }

        var wdths = plugin.widths;
        for(var i = 0, colCount = this.countCols(); i < colCount ; i++) {
          if (this.params.columns && this.params.columns[i].renderer.name != "customRenderer") {
            plugin.calculateColumnsWidth(i, 300, true);
          }
        }
      }
    };
  },

  afterChangeCallback: function(x) {

    x.afterChange = function(changes, source) {
      if (this.params && this.params.debug) {
        if (this.params.debug > 0) {
          console.log("afterChange: " + source);
        }
        if (this.params.debug > 1) {
          console.log("afterChange:");
          console.log(changes);
        }
      }

      if (HTMLWidgets.shinyMode) {
        if (changes && (changes.some(function(chg) {return chg[2] !== null || chg[3] !== null}))) {
          if (this.sortIndex && this.sortIndex.length !== 0) {
            c = [this.sortIndex[changes[0][0]][0], changes[0].slice(1, 1 + 3)];
          } else {
            c = changes;
          }

          if (this.params && this.params.debug) {
            if (this.params.debug > 0) {
              console.log("afterChange: Shiny.onInputChange: " + this.rootElement.id);
            }
          }
          Shiny.onInputChange(this.rootElement.id, {
            data: this.getData(),
            changes: { event: "afterChange", changes: c, source: source },
            params: Object.assign({}, this.params, {formulas: undefined}) // remove formulas to prevent circular
          });
        } else if ((source === "loadData" || source === "updateData") && this.params) {

          if (this.params && this.params.debug) {
            if (this.params.debug > 0) {
              console.log("afterChange: Shiny.onInputChange: " + this.rootElement.id);
            }
          }
          // push input change to shiny so input$hot and output$hot are in sync (see #137)
          Shiny.onInputChange(this.rootElement.id, {
            data: this.getData(),
            changes: { event: "afterChange", changes: null },
            params: Object.assign({}, this.params, {formulas: undefined}) // remove formulas to prevent circular
          });
        }
      }

    };

    x.afterLoadData = function(firstTime) {
      if (this.params && this.params.debug) {
        if (this.params.debug > 0) {
          console.log("afterLoadData: " + firstTime);
        }
      }
    };

    x.afterChangesObserved = function(firstTime) {
      if (this.params && this.params.debug) {
        if (this.params.debug > 0) {
          console.log("afterChangesObserved");
        }
      }
    };

    x.afterInit = function() {
      if (this.params && this.params.debug) {
        if (this.params.debug > 0) {
          console.log("afterInit");
        }
      }
    };
  },

  afterCellMetaCallback: function(x) {

    x.afterSetCellMeta = function(r, c, key, val) {

      if (HTMLWidgets.shinyMode && key === "comment") {
        if (this.params && this.params.debug) {
          if (this.params.debug > 0) {
            console.log("afterSetCellMeta: Shiny.onInputChange: " + this.rootElement.id);
          }
        }
        Shiny.onInputChange(this.rootElement.id + "_comment", {
          data: this.getData(),
          comment: { r: r + 1, c: c + 1, key: key, val: val},
          params: Object.assign({}, this.params, {formulas: undefined}) // remove formulas to prevent circular
        });
      }

    };
  },

  afterSelectCallback: function(x) {

    x.afterSelectionEnd = function(r, c, r2, c2) {

      if (HTMLWidgets.shinyMode) {
        if (this.sortIndex && this.sortIndex.length !== 0) {
          r = this.sortIndex[r][0];
          r2 = this.sortIndex[r2][0];
        }

        if (this.params && this.params.debug) {
          if (this.params.debug > 0) {
            console.log("afterSelectionEnd: Shiny.onInputChange: " + this.rootElement.id);
          }
        }
        Shiny.onInputChange(this.rootElement.id + "_select", {
          data: this.getData(),
          select: { r: r + 1, c: c + 1, r2: r2 + 1, c2: c2 + 1},
          params: Object.assign({}, this.params, {formulas: undefined}) // remove formulas to prevent circular
        });
      }

    };
  },

  afterRowAndColChange: function(x) {

    x.afterCreateRow = function(ind, ct) {

      if (HTMLWidgets.shinyMode) {

        if (this.params && this.params.columns) {
          for(var i = 0, colCount = this.countCols(); i < colCount ; i++) {
            this.setDataAtCell(ind, i, this.params.columns[i].default);
          }
        }

        if (this.params && this.params.debug) {
          if (this.params.debug > 0) {
            console.log("afterCreateRow: Shiny.onInputChange: " + this.rootElement.id);
          }
        }
        Shiny.onInputChange(this.rootElement.id, {
          data: this.getData(),
          changes: { event: "afterCreateRow", ind: ind, ct: ct },
          params: Object.assign({}, this.params, {formulas: undefined}) // remove formulas to prevent circular
        });
      }
    };

    x.afterRemoveRow = function(ind, ct) {

      if (HTMLWidgets.shinyMode)
        if (this.params && this.params.debug) {
          if (this.params.debug > 0) {
            console.log("afterRemoveRow: Shiny.onInputChange: " + this.rootElement.id);
          }
        }
        Shiny.onInputChange(this.rootElement.id, {
          data: this.getData(),
          changes: { event: "afterRemoveRow", ind: ind, ct: ct },
          params: Object.assign({}, this.params, {formulas: undefined}) // remove formulas to prevent circular
        });
    };

    x.afterCreateCol = function(ind, ct) {

      if (HTMLWidgets.shinyMode)
        if (this.params && this.params.debug) {
          if (this.params.debug > 0) {
            console.log("afterCreateCol: Shiny.onInputChange: " + this.rootElement.id);
          }
        }
        Shiny.onInputChange(this.rootElement.id, {
          data: this.getData(),
          changes: { event: "afterCreateCol", ind: ind, ct: ct },
          params: Object.assign({}, this.params, {formulas: undefined}) // remove formulas to prevent circular
        });
    };

    x.afterRemoveCol = function(ind, ct) {

      if (HTMLWidgets.shinyMode)
        if (this.params && this.params.debug) {
          if (this.params.debug > 0) {
            console.log("afterRemoveCol: Shiny.onInputChange: " + this.rootElement.id);
          }
        }
        Shiny.onInputChange(this.rootElement.id, {
          data: this.getData(),
          changes: { event: "afterRemoveCol", ind: ind, ct: ct },
          params: Object.assign({}, this.params, {formulas: undefined}) // remove formulas to prevent circular
        });
    };

  },

  // see http://handsontable.com/demo/heatmaps.html
  initHeatmap: function(firstTime, source) {
    this.heatmap = [];

    for(var i = 0, colCount = this.countCols(); i < colCount ; i++) {
      this.heatmap[i] = generateHeatmapData.call(this, i);
    }
  },

  updateHeatmap: function(change, source) {
    this.heatmap[change[0][1]] = generateHeatmapData.call(this, change[0][1]);
  }

});

function generateHeatmapData(colId) {

  var values = this.getDataAtCol(colId);

  return {
    min: Math.min.apply(null, values),
    max: Math.max.apply(null, values)
  };
}

// https://stackoverflow.com/questions/22477612/converting-array-of-objects-into-array-of-arrays
function toArray(input) {
  var result = input.map(function(obj) {
    return Object.keys(obj).map(function(key) {
      return obj[key];
    });
  });
  return result;
}

// csv logic adapted from https://github.com/juantascon/jquery-handsontable-csv
function csvString(instance, sep, dec) {

  var headers = instance.getColHeader();

  var csv = headers.join(sep) + "\n";

  for (var i = 0; i < instance.countRows(); i++) {
      var row = [];
      for (var h in headers) {
          var col = instance.propToCol(h);
          var value = instance.getDataAtRowProp(i, col);
          if ( !isNaN(value) ) {
            value = value.toString().replace(".", dec);
          }
          row.push(value);
      }

      csv += row.join(sep);
      csv += "\n";
  }

  return csv;
}

function customRenderer(instance, TD, row, col, prop, value, cellProperties) {
    if (['date', 'handsontable', 'dropdown'].indexOf(cellProperties.type) > -1) {
      type = 'autocomplete';
    } else {
      type = cellProperties.type;
    }
    Handsontable.renderers.getRenderer(type)(instance, TD, row, col, prop, value, cellProperties);
}

function safeHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
  var escaped = Handsontable.helper.stringify(value);
  if (instance.getSettings().allowedTags) {
    tags = instance.getSettings().allowedTags;
  } else {
    tags = '<em><b><strong><a><big>';
  }
  escaped = strip_tags(escaped, tags); //be sure you only allow certain HTML tags to avoid XSS threats (you should also remove unwanted HTML attributes)
  td.innerHTML = escaped;

  return td;
}
