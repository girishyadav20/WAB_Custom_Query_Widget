define(['dojo/_base/declare',
  'dojo/_base/lang',
  'dojo/_base/array',
  'dojo/_base/html',
  'dojo/_base/fx',
  'dojo/dom',
  'dojo/dom-construct',
  'dojo/on',
  'dojo/store/Memory',
  'dojo/topic',
  'dijit/registry',
  'dijit/Dialog',
  'dgrid/OnDemandGrid',
  'dgrid/Grid',
  'dgrid/Selection',
  'dgrid/extensions/ColumnResizer',
  'dgrid/extensions/Pagination',  
 'jimu/BaseWidget',
 'jimu/dijit/TabContainer',
 'esri/graphic',
 'esri/graphicsUtils',
 'esri/symbols/SimpleFillSymbol',
 'esri/symbols/SimpleLineSymbol',
 'esri/symbols/SimpleMarkerSymbol',
 'esri/Color',
 './helper/QueryFilter' ],
function(declare, lang, array, html, fx, dom, domConstruct, on, Memory, topic, registry, Dialog, 
 OnDemandGrid, Grid, Selection, ColumnResizer, Pagination,
 BaseWidget, TabContainer, Graphic, graphicsUtils, SimpleFillSymbol, SimpleLineSymbol, SimpleMarkerSymbol, Color, QueryFilter) {

  var grid = null;
  //var projectLayers = null;
  //test

  return declare([BaseWidget], {
	
    baseClass: 'jimu-widget-query-builder',

    _messageDialog: null,
    qf: null,

    postCreate: function() {
      this.inherited(arguments);

      this._initQueriesContainer();

      this.own(
        on(this.backBtn, 'click', lang.hitch(this, "_onBackClicked")),
        on(this.clearBtn, 'click', lang.hitch(this, "_onClearSelection")),
        on(this.exportBtn, 'click', lang.hitch(this, "_exportResults"))
      );      
    },

    startup: function() {
      this.inherited(arguments);
      var panel = this.getPanel();
      if(panel){
        //panel.disableResizable();
      }
    },

    _initQueriesContainer: function(){
      //create query filter
      if(!this.qf){
        this.qf = new QueryFilter({
          map: this.map,
          isQueryProject: false
        });      
        this.qf.on("queryComplete", lang.hitch(this, "_onQueryComplete"));  
        this.qf.on("queryFailed", lang.hitch(this, "_onQueryFailed"));     
        this.qf.placeAt(this.queryBuilderNode);        
      };    
    },

    _onQueryComplete: function(results) {
      this._createAttributeViewer(results);
    },

    _onQueryFailed: function(message) {
      this._showMessage(message, "Execute Query");
    },

    _createAttributeViewer: function(featureSet){
      //create a data store
      var attributeData = [];
      this.featureCount.innerHTML = featureSet.features.length;
      array.forEach(featureSet.features, function(feature, index) {
        var attr = feature.attributes;
        attr["geom"] = feature.geometry;
        attr["_storeIndex"] = index;
        attributeData.push(attr);
      })
      var attributeStore = new Memory({idProperty: "_storeIndex", data: attributeData});
      var columns = this._getColumns(featureSet);

      if(!grid) {
        //create OnDemand Grid       
        var customGrid = declare([Grid, Pagination, ColumnResizer, Selection]);
        grid = new customGrid({
          store: attributeStore,
          columns: columns,
          pagingLinks: 2,          
          firstLastArrows: true,
          rowsPerPage: 500,
          loadingMessage: "Loading features...",
          noDataMessage: "No feature found."     
        }, this.attributeViewer);

        grid.startup();
      } else {
        grid.set("columns", columns);
        grid.set("store", attributeStore);
        grid.refresh();
        grid.resize();
      }

      // comments grid
      grid.on("dgrid-select", lang.hitch(this, function (event) {
        var selectedRows = event.rows.map(function(r){return {index: r.data._storeIndex, geom: r.data.geom}}); 
        if(selectedRows.length > 0 && selectedRows[0].geom){
          this._addGraphicsToMap(selectedRows);
        }               
      }));

      grid.on('dgrid-deselect', lang.hitch(this, function (event) {
        if(event.rows[0].data.geom){
          var deSelectedRows = event.rows.map(r => {return r.data._storeIndex});
          this._removeGraphicsFromMap(deSelectedRows);
        }
        
      }));
            
      //this._slide(dom.byId('queryContainer'), 0, -100);
      this._slide(this.queryContainer, 0, -100);
      this._slide(this.resultsContainer, 100, 0);
      this.resize();
    },

    _getColumns: function(featureSet){
      var columns = [];
      if(!featureSet) return columns;
      if(featureSet.fieldAliases) {
        columns = featureSet.fieldAliases;
      } else if(featureSet.fields) {
        columns = featureSet.fields.map(field => {
          return {
            field: field.name,
            label: field.alias || field.name
          };
        });        
      }
      return columns;
    },

    _onBackClicked: function() {     
      //this._removeGraphicsFromMap();
      if(grid) grid.clearSelection()
      //this._slide(dom.byId('queryContainer'), -100, 0);
      this._slide(this.queryContainer, -100, 0);
      this._slide(this.resultsContainer, 0, 100);
    },

    _onClearSelection: function(){
      if(grid) grid.clearSelection();
    },

    _slide:function(dom, startLeft, endLeft){
      //html.setStyle(dom, 'display', 'block');
      html.setStyle(dom, 'left', startLeft+"%");
      fx.animateProperty({
        node: dom,
        properties:{
          left:{
            start: startLeft,
            end: endLeft,
            units:'%'
          }
        },
        duration: 500,
        onEnd: lang.hitch(this,function(){
          html.setStyle(dom, 'left', endLeft);          
        })
      }).play();
    },

   

    onOpen: function(){
      //console.log('onOpen');

      // if(!this.pqf){
      //   var layers =  this._getFeatureLayers();       
      //   //create Project Query builder      
      //   this.pqf = new QueryFilter({
      //     beforeText: "Search for ",
      //     afterText: " features that are in project ",
      //     noFilterTipText: "Add a filter expression to further narrow down your search.",
      //     map: this.map,          
      //     projectFLs: layers
      //   });
      //   this.pqf.on("queryByProjectCompleted", lang.hitch(this, "_onQueryComplete"));
      //   this.pqf.on("queryByProjectFailed", lang.hitch(this, "_onQueryFailed"));
      //   this.pqf.placeAt(this.queryByProjNode); 
      //   this.pqf.startup();       
      // }

      //this._updateProjectsList();
      //this.pqf.set("isQueryByProject", true);      

      // //create query builder
      // if(!this.qf){
      //   this.qf = new QueryFilter({
      //     map: this.map,
      //     isQueryProject: false
      //   });      
      //   this.qf.on("queryComplete", lang.hitch(this, "_onQueryComplete"));  
      //   this.qf.on("queryFailed", lang.hitch(this, "_onQueryFailed"));     
      //   this.qf.placeAt(this.queryBuilderNode);
      //   this.qf.startup();
      // }      

    },

    onClose: function(){
      console.log('onClose');
      //this._removeGraphicsFromMap();
      if(grid) grid.clearSelection()
      
      // if(this.qf){
      //   this.qf.destroy();
      //   this.qf = null;
      // } 
      // if(this.pqf){
      //   this.pqf.destroy();
      //   this.pqf = null;
      // } 
    },

    resize: function(){
      var box = html.getMarginBox(this.domNode);
      var listHeight = box.h - 60;
      html.setStyle(this.attributeViewer, 'height', listHeight + 'px');     
      if(grid){
        grid.resize();
      }
    },

    _getProjects: function(){
      var pg = registry.byId("ProjectGrid");
      if(!pg) return; //message: Project Grid not found
      //if(!pg.myProjectsDataStore) return; //message: Projects not found
      if(!pg.projectGrid.store) return;
      var visibleProjects = pg.getVisibleRows(); //to get only visible projects      
      var projectList = [];      
      array.forEach(visibleProjects, function(project, index){        
        var projectInfo = {};
        projectInfo.id = index;
        projectInfo.name = project.projName;
        projectInfo.value = project.ProjectID;
        projectList.push(projectInfo);
      });

      return projectList;
    },

    _updateProjectsList: function(){
      var projects = this._getProjects();
      if(this.pqf){
        this.pqf.set("projectsToQuery", projects);
      }      
    },

    _getFeatureLayers: function () {
      var ids = this.map.graphicsLayerIds;
      var len = ids.length;
      var featureLayers = []
      for (var i = 0; i < len; i++) {
        var layer = this.map.getLayer(ids[i]);        
        //add only if its feature service
        if (layer._fserver && layer.isProjectFeatureLayer) {          
          featureLayers.push(layer);
        }
      }
      return featureLayers;
    },

    _addGraphicsToMap: function(geometries){
      // //create a symbol
      var type = geometries[0].geom.type;
      var symbol = null;
      switch(type){
        case "polygon":
          symbol = new SimpleFillSymbol();
          symbol.color = new Color("cyan");
          break;
        case "polyline":
          symbol = new SimpleLineSymbol();
          symbol.color = new Color("cyan");
          symbol.width = 3;
          break;
        case "point":
          symbol = new SimpleMarkerSymbol();
          symbol.color = new Color("cyan");
          break;
      }

      if(!this.map) return; 
      var graphic;
      var graphics = [];      
      geometries.forEach(geometryInfo => {
        if(this._isGraphicAlreadyAdded(geometryInfo.index)) return;
        graphic = new Graphic(geometryInfo.geom);
        graphic.symbol = symbol;
        graphic._storeIndex = geometryInfo.index; //connector with attribute grid
        this.map.graphics.add(graphic);
        graphics.push(graphic);
      });
      if(graphics.length > 0){
        var ext = graphicsUtils.graphicsExtent(graphics);
        this.map.setExtent(ext, true);
      } 
    },

    _removeGraphicsFromMap: function(indices){      
      if(!this.map) return;
      //var indicesArr = indices.split(",") || [];
      var toRemove = this.map.graphics.graphics.filter(function(val){
        if(val._storeIndex === undefined) return false; //ignore if not associated with attribute viewer
        //remove all if indices is not given OR remove the given index
        return (indices.length === 0 || indices.indexOf(val._storeIndex) >= 0) ? true : false;
      });

      toRemove.forEach(gr => {this.map.graphics.remove(gr)});      
      //this.map.graphics.clear();
    },

    _isGraphicAlreadyAdded: function(index){
      return this.map.graphics.graphics.filter(g => {return g._storeIndex === index}).length > 0;
    },

    _exportResults: function(){
      this.exportToCSV();
    },

    exportToCSV: function() {

      if(grid.store.data.length <= 0) return; //message no features found
      var columnIds = [];
      var csvString = "";
      //column headers
      for (var property in grid.columns) {
        if(grid.columns.hasOwnProperty(property)) {
          columnIds.push(property);
          csvString += (csvString.length == 0 ? "" : ",") + '"' + grid.columns[property].label + '"';
        }
      }
      csvString += "\r\n";

      //rows      
      array.forEach(grid.store.data, function(row){
        var csvRow = "";
        array.forEach(columnIds, function(col, index){
          csvRow += (csvRow.length == 0 ? "" : ",") + '"' + row[col] + '"';
        });        
        csvString += csvRow + "\r\n";
      })

      this.download("export" + ".csv", csvString);
        
    },

     download: function(filename, text) {
          // if (has("ie") || this._isIE11()) { // has module unable identify ie11
          //     var oWin = window.top.open("about:blank", "_blank");
          //     oWin.document.write(text);
          //     oWin.document.close();
          //     oWin.document.execCommand('SaveAs', true, filename);
          //     oWin.close();
          // } else {
              var link = domConstruct.create("a", {
                  href: 'data:text/plain;charset=utf-8,' + encodeURIComponent(text),
                  download: filename
              }, this.domNode);
              link.click();
              domConstruct.destroy(link);
          //}
      },

      _showMessage: function(message, title){

        title = title || "Query";
        var content = '<div>' +
                        '<div style="line-height: 20px;">' + message + '</div>' +
                        '<button id="okBtn1" class="btn-alt btn-info" type="button" style="min-width:100px; float:right; margin:15px;">OK</button>' +                            
                        '</div>';

        if (!this._messageDialog) {       

          this._messageDialog = new Dialog({          
            style: "width: 400px"
          });
        };

        this._messageDialog.set("title", title);
        this._messageDialog.set("content", content);
        this._messageDialog.show();
        on(document.getElementById("okBtn1"), "click", lang.hitch(this, function (evt) {
          evt.stopPropagation();
          this._messageDialog.hide();
        }));
      }

      // _isIE11: function() {
      //     var iev = 0;
      //     var ieold = (/MSIE (\d+\.\d+);/.test(navigator.userAgent));
      //     var trident = !!navigator.userAgent.match(/Trident\/7.0/);
      //     var rv = navigator.userAgent.indexOf("rv:11.0");

      //     if (ieold) {
      //         iev = Number(RegExp.$1);
      //     }
      //     if (navigator.appVersion.indexOf("MSIE 10") !== -1) {
      //         iev = 10;
      //     }
      //     if (trident && rv !== -1) {
      //         iev = 11;
      //     }

      //     return iev === 11;
      // },

  });
});