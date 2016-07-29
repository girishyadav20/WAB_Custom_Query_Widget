define ([
	'dojo/_base/declare',
	'dojo/_base/lang',
	'dojo/_base/array',
	'dojo/_base/html',
	'dojo/dom-construct',
	'dojo/query',
	'dojo/on',
	'dojo/Evented',
	'dojo/promise/all',
	'dojo/store/Memory',
	'dijit/registry',
	'dijit/_WidgetBase',
 	'dijit/_TemplatedMixin',
 	'dijit/_WidgetsInTemplateMixin',
 	'dijit/Toolbar',
 	'dijit/form/Select',
 	'dijit/form/FilteringSelect',
 	'dijit/form/Button',
 	'dijit/form/CheckBox',
 	'dgrid/OnDemandGrid',
 	'dojox/widget/Standby',
 	'esri/layers/ArcGISDynamicMapServiceLayer',
 	'esri/layers/FeatureLayer',
 	'esri/geometry/geometryEngine',
 	'esri/tasks/QueryTask', 	
 	'esri/tasks/query',
 	'esri/tasks/GeometryService',
 	'jimu/dijit/Filter',
 	'jimu/dijit/Popup',
 	'dojo/text!./QueryFilter.html',
 	'dojo/domReady!'
	],
	function (declare, lang, array, html, domConstruct, query, on, Evented, all, Memory, 
	registry, WidgetBase, TemplateMixin, _WidgetsInTemplateMixin, Toolbar, Select, FilteringSelect, Button, CheckBox,
	OnDemandGrid, Standby, ArcGISDynamicMapServiceLayer, FeatureLayer,	geometryEngine, QueryTask, Query, GeometryService,
  Filter, Popup, template){

		featSet = null;
		whereClause = "";
		isQueryNextPage = false;
		featuresQueried = 0;
		maxRecordCount = 0;
		
		
		return declare ([WidgetBase, TemplateMixin, Evented, _WidgetsInTemplateMixin], {
			baseClass: "jimu-widget-query-filter MassDOTTheme",
			templateString: template,

			map: null,
			popup: null,
			isQueryProject: false,
			_setIsQueryProjectAttr: function(val){
				this._set("isQueryProject", val);
				if(val){
					html.setStyle(this.returnGeomContainer, "display", "none");
				} else {
					html.setStyle(this.returnGeomContainer, "display", "block");
				}
			},
			isQueryByProject: false,
			_setIsQueryByProjectAttr: function(val){
				this._set("isQueryByProject", val);
				if(val){
					//this._initQueryByProj();
				}				
			},
			projectsToQuery: [],
			_setProjectsToQueryAttr: function(val){
				this._set("projectsToQuery", val);
				if(val.length > 0){
					this._initQueryByProj();
				}
			},
			projectFLs: null,
			beforeText: "Query features from ",
			afterText: " layer, that satisfy the following criteria:",
			noFilterTipText: "Apply without any filter expression to list all features in the selected layer.",
			queryLimit: null,
			respectServerSetLimit: true,

			selectedLayerUrl: "",	
			_setSelectedLayerUrlAttr: function(newVal){
				this._set("selectedLayerUrl", newVal);
				this._updateFilter(newVal);
			},

			_filter: null,
			_returnGeometry: false,
			_layerListDijit: null,

			postCreate: function() {
				this._initToolbar();				
				this._createFilter();
				this._populateLayersList();

				this.own(
					on(this.applyBtn, 'click', lang.hitch(this, "onApply")),
					on(this.returnGeom, 'change', lang.hitch(this, function(val){
						this._returnGeometry = val;
					}))		
					//on(this.cancelBtn, 'click', lang.hitch(this,"onCancel"))
				)

				this._digitify();	

				//Add standby spinner
		      	if (!registry.byId("filterSpinner")) {
		        	var spinner = new Standby({
		          	id: "filterSpinner",
		          	target: this.domNode
		        	});
		        	document.body.appendChild(spinner.domNode);
		        	spinner.startup();
		      	}

		      	this.resize();
			},

			startup: function() {
				// this.own(
				// 	on(this.applyBtn, 'click', lang.hitch(this, "onApply")),
				// 	on(this.returnGeom, 'change', lang.hitch(this, function(val){
				// 		this._returnGeometry = val;
				// 	}))		
				// 	//on(this.cancelBtn, 'click', lang.hitch(this,"onCancel"))
				// )

				// this._digitify();	

				// //Add standby spinner
		  //     	if (!registry.byId("filterSpinner")) {
		  //       	var spinner = new Standby({
		  //         	id: "filterSpinner",
		  //         	target: this.domNode
		  //       	});
		  //       	document.body.appendChild(spinner.domNode);
		  //       	spinner.startup();
		  //     	}

		  //     	this.resize();
			},

			resize: function(){
				var box = html.getMarginBox(this.domNode);
	      // var listHeight = box.h - 60;
	      // html.setStyle(this.attributeViewer, 'height', listHeight + 'px');     
	      // if(grid){
	      //   grid.resize();
	      // }
			},

			queryByExpression: function(expr) {
				this._queryFL(expr, 0);
			},

			queryProjectsByExpression: function(expr){ 
				this._queryFLforProjects(expr, 0, null);
			},

			onApply: function() {
				//get the expression
				if(!this._filter.toJson()) return;
				this._reset();

				//this._standBy(true);
				var expr = this._filter.toJson().expr;
				if(this.isQueryProject) {
					this._queryFLforProjects(expr, featuresQueried, null);
				} else if (this.isQueryByProject){
					var project = this.projectList.item.value;
					this._queryFLforProjects(expr, featuresQueried, project);
				} else {
					this._queryFL(expr, featuresQueried);
				}
				
			},

			onLayerSelected: function(val){
				this.set("selectedLayerUrl", val);
			},

			_reset: function(){
				featuresQueried = 0;
				maxRecordCount = 0;
				isQueryNextPage = false;
				featSet = null;
				whereClause = "";
			},

			// onCancel: function() {
			// 	this.parent;

			// },
			_standBy: function(isBusy) {
				var spinner = registry.byId("filterSpinner");
	      if (isBusy) {
	        spinner.show();
	        //this.set("isBusy", true);          
	      } else {
	        spinner.hide();
	        //this.set("isBusy", false);
	      }
			},

			_populateLayersList: function() {
				if(!this.map) return;				
				//get the layers. Iterate in reverse order because the top layer has highest index in map.layerIds array					
				for(var i = this.map.layerIds.length - 1; i >= 0; i--) {
					var layer = this.map.getLayer(this.map.layerIds[i]);
					if(layer instanceof ArcGISDynamicMapServiceLayer) {
						var url = layer.url;
						array.forEach(layer.layerInfos, lang.hitch(this, function(layerInfo){
							if(layerInfo.subLayerIds != null) return; // do not add Group layers
							var option = domConstruct.create("option");
							option.label = layerInfo.name;
							option.value = url+'/'+layerInfo.id;
							this.layerList.options.add(option);							
						}))						
					};					
				}
				//get feature layers
				for(var i = this.map.graphicsLayerIds.length - 1; i >= 0; i--) {
					var layer = this.map.getLayer(this.map.graphicsLayerIds[i]);
					if(layer instanceof FeatureLayer && layer.url) {
						var option = domConstruct.create("option", {
							label: layer.name,
							value: layer.url
						});
						this.layerList.options.add(option);									
					};					
				}
				this.set("selectedLayerUrl", this.layerList.value);
			},

			_createFilter: function() {				
				this._filter = new Filter({
					"noFilterTip": this.noFilterTipText
				});
				
				this._filter.placeAt(this.filterContainer);
			},

			_updateFilter: function(url) {
				if(this._filter.isBuilding()) return;
				this._filter.reset();
				this._filter.buildByExpr(url, "");
			},

			_digitify: function() {
				//digitify the select      
	      //query(this.LayerList, this.domNode).forEach(lang.hitch(this, function(select){
	        this._layerListDijit = new Select({
	          options: this.layerList.options,
	          onChange: lang.hitch(this, function(val){
							this.set("selectedLayerUrl", val);
						})      
	         
	        }, this.layerList)

	        this._layerListDijit.startup();       
	      //})); 
			},

			_initToolbar: function(){
				var toolbar = new Toolbar({}, this.queryToolbar);
				var saveBtn = new Button({
					label: "Save Query",
					showLabel: false,
					iconClass: "dijitIcon dijitIconSave"
				});
				saveBtn.startup();
				toolbar.addChild(saveBtn);
				var loadBtn = new Button({
					label: "Load Query",
					showLabel: false,
					iconClass: "dijitIcon dijitIconFolderOpen"
				});
				toolbar.addChild(loadBtn);
				toolbar.startup();

				this.own(
					on(saveBtn, "click", lang.hitch(this, "onSaveQuery")),
					on(loadBtn, "click", lang.hitch(this, "onLoadQuery"))
				);
			},

			_queryFL: function(where, start) {
				// if(!featureLayer){
				// 	featureLayer = new FeatureLayer(this.selectedLayerUrl);								
				// }
				this._standBy(true);
				whereClause = where;
				var query = new Query();
				query.where = where;
				if(!this.isQueryProject){
					query.outFields = ["*"]; //return all  fields if normal query					
				}
				// if(this.isQueryProject){
				// 	query.geometry = this._getProjectGeom()[1];
				// }
				query.returnGeometry = this._returnGeometry;
				query.outSpatialReference = this.map.spatialReference;
				if(isQueryNextPage){
					query.start = start;
					query.num = maxRecordCount;
				}				
				var flQueryTask = new QueryTask(this.selectedLayerUrl);
				flQueryTask.execute(query, lang.hitch(this, this._queryComplete), lang.hitch(this, this._queryFailed));

			},

			_queryFLforProjects: function(where, start, project){
				var queryTasks = [];
				this._standBy(true);
				array.forEach(this.projectFLs, lang.hitch(this, function(projLyr){
					var filterGeom = this._getUnionedProjGeom(projLyr, project);
					if(!filterGeom) return;
					var query = new Query();
					query.where = where;
					query.geometry = filterGeom;	
					query.outSpatialReference = this.map.spatialReference;				
					if(this.isQueryByProject){
						query.outFields = ["*"];
						query.returnGeometry = this._returnGeometry;
					} else if(this.isQueryProject) {
						query.returnGeometry = true;
					}
					var qt = new QueryTask(this.selectedLayerUrl);
					queryTasks.push(qt.execute(query));
				}))
				if(queryTasks.length > 0){
					all(queryTasks).then(lang.hitch(this,this._queryFLforProjectsComplete), lang.hitch(this, this._queryFLforProjectsFailed));
				} else {
					this._standBy(false);
					if(this.isQueryByProject) {
						this.emit("queryByProjectFailed", "Project geometry not found.");
					} else {
						this.emit("applyFilterFailed", "Project geometry not found.");
					}					
				}
			},

			_queryFLforProjectsComplete: function(results) {
				//var queryGeoms = [];
				var featureSet = null;
				array.forEach(results, function(result) {
					if(! result.hasOwnProperty("features")) {
						//error no feature found for 						
						return;
					}
					if(featureSet){
						var allfeatures = featureSet.features.concat(result.features);
						featureSet.features = allfeatures;
					} else {
						featureSet = result;
					}
					// array.forEach(result.features, function(feature) {
					// 	queryGeoms.push(feature.geometry);	
					// })
				});
				// if(queryGeoms.length <= 0) {
				if(!featureSet || featureSet.features.length <= 0) {
					this._standBy(false);
					if(this.isQueryByProject){
						this.emit("queryByProjectFailed", "No feature found.");
					} else {
						this.emit("applyFilterFailed", "No project found that satisfy the filtering criteria.");
					}					
				} else if (this.isQueryProject) {
					var queryGeoms = [];
					array.forEach(featureSet.features, function(feature) {
						queryGeoms.push(feature.geometry);	
					})
					this._queryProjects(queryGeoms);	
				} else if (this.isQueryByProject) {
					this._standBy(false);
					this.emit("queryByProjectCompleted", featureSet);
				}
			},

			_queryFLforProjectsFailed: function(err) {
				this._standBy(false);
				this.emit("applyFilterFailed", "Query failed!<br> Please re-execute. If Problem persist, contact administrator.");
			},

			_getUnionedProjGeom: function(layer, project){	
				var geom = [];
				var projectIds = [];
			  array.forEach(layer.graphics, lang.hitch(this, function(feat){
			  	if(project){			  		
			  		//if(feat.attributes.ProjectID === project){
			  		projectIds = project.split(",");
			  		if(projectIds.indexOf(feat.attributes.ProjectID) >= 0) {
			  			geom.push(feat.geometry);
			  		}
			  	} else {
			  		geom.push(feat.geometry);
			  	}
			 	 	
			  }))
			  return geometryEngine.union(geom);
			},

			_queryComplete: function(featureSet) {				
				if(featSet){
					var allFeatures = featSet.features.concat(featureSet.features);
					featSet.features = allFeatures;
				} else {
					featSet = featureSet;
				}

				if((featureSet.exceededTransferLimit || featureSet.features.length === maxRecordCount) && !this.respectServerSetLimit){
					isQueryNextPage = true;		
					featuresQueried += featureSet.features.length;
					if(maxRecordCount <= 0) {
						maxRecordCount = featureSet.features.length;
					}					
											
					this._queryFL(whereClause, featuresQueried);
				} else {	
					this._standBy(false);
					if(featSet.features.length === 0){
						this.emit("queryFailed", "No feature found.");
					} else {
						this.emit("queryComplete", featSet);
					}												
				}				
			},

			_queryProjects: function(geometries) {				
				//var geometries = [];
				var queryTasks = [];
				//consolidate geometries
				// array.forEach(featureSet.features, function(feature) {
				// 	geometries.push(feature.geometry);
				// })
				if(geometries.length<=0){
					this._standBy(false);
					this.emit("applyFilterFailed", "No project found that satisfy the filtering criteria.");
					return;
				} 
				var unionedGeom = geometryEngine.union(geometries);
				//spatial query on ProjectLines and ProjectPoly FLs
				array.forEach(this.projectFLs, function(projFL){
					var query = new Query();
					query.geometry = unionedGeom;
					query.outFields = ["ProjectID"];
					query.returnGeometry = false;
					var projQueryTask = new QueryTask(projFL.url);
					qt = projQueryTask.execute(query);
					queryTasks.push(qt);
				});

				if(queryTasks){
					all(queryTasks).then(lang.hitch(this,this._handleQueryResults), this._queryProjectsFailed);
				}
				
			},

			_handleQueryResults: function(results){
				var projIDs = [];
				array.forEach(results, function(result) {
					if(! result.hasOwnProperty("features")) {
						//error no feature found for 						
						return;
					}
					array.forEach(result.features, function(feature) {
						var projID = feature.attributes.ProjectID
						//add only the unique ProjIds
						var i = array.indexOf(projIDs, projID);
						if(i < 0) {
							projIDs.push(projID);
						}						
					})
				})				
				this._standBy(false);
				if(projIDs.length <= 0){
					this._standBy(false);
					this.emit("applyFilterFailed", "No project found that satisfy the filtering criteria.");
				}
				this._standBy(false);
				this.emit("applyFilter", projIDs);				
				
			},		

			_queryProjectsFailed: function(err){
				this._standBy(false);
				this.emit("applyFilterFailed", "Query failed!<br> Please re-execute. If Problem persist, contact administrator.");
			},

			_queryFailed: function(error) {
				this._standBy(false);
				this.emit("queryFailed", "Query failed!<br> Please re-execute. If Problem persist, contact administrator.");
			},

			_initQueryByProj: function(){
				if(this.projectsToQuery.length > 0){
					//add All option
					var all = {
						id: this.projectsToQuery.length,
						name: "All",
						value: this.projectsToQuery.map(function(p){return p.value;}).toString()
					}
					this.projectsToQuery.unshift(all);
					var store = new Memory({ data: this.projectsToQuery });
					this.projectList.set("store", store);
					this.projectList.setValue(0);
					this.projectList.set("style", "display: inline-block;");
				}				
			},

			onSaveQuery: function(){
				//create popup
				var content = '<div>Query Name: <input class="query-name" type="text" placeholder="' + 'Query-' + localStorage.length + '"></div>';
				var popup = new Popup({
					titleLabel: "Save Query",
					content: content,
					container: this.domNode.parentNode || this.domNode,
					maxWidth: 350,
					maxHeight: 180,
					buttons: [{
						label: "Save",
						onClick: lang.hitch(this, function(evt){
							//get queryname
							var name = query(".query-name", popup.domNode)[0].value || "Query-" + localStorage.length;
							//append identifier MSQ (MaPPS Stored Query) with the queryname
							var name = "MSQ#" + name;							
							var queryInfo = {								
								"layerUrl": this.selectedLayerUrl,
								"isQueryByProject": this.isQueryByProject,
								"filter": this._filter.toJson(),
								"returnGeometry": this._returnGeometry
							};								
							localStorage.setItem(name, JSON.stringify(queryInfo));
							popup.close();
						})
					}]
				});

				//this._saveQueryToStorage();
			},

			onLoadQuery: function(){
				//get query items from local storage
				var queryList = [];
				for(var i=0; i<localStorage.length; i++){
					var qName = localStorage.key(i);
					if(qName.startsWith('MSQ#')){
						var valObj = JSON.parse(localStorage.getItem(qName))
						if(valObj && valObj.isQueryByProject === this.isQueryByProject){		
							var actualName = qName.substr(qName.indexOf('#')+1);					
							queryList.push({label: actualName, value: JSON.stringify(valObj)});
						}
					}
				}
				var content = new Select({
          options: queryList          
        }); 

				var popup = new Popup({
					titleLabel: "Load Query",
					content: content,
					container: this.domNode.parentNode || this.domNode,
					maxWidth: 350,
					maxHeight: 180,
					buttons: [{
						label: "Load",
						onClick: lang.hitch(this, function(evt){							
							var queryInfo = JSON.parse(content.value);
							this._layerListDijit.set("value", queryInfo.layerUrl);	
							this.returnGeom.set("value", queryInfo.returnGeometry);		
							if(queryInfo.layerUrl && queryInfo.filter){
								this._filter.buildByFilterObj(queryInfo.layerUrl, queryInfo.filter);
							}		
							popup.close();
						})
					}]
				});

			}

			// _getUniqueFromArray: function(allArray){
			// 	var unique = {};
			// 	return array.filter(allArray, function(val) {
			// 		if(!unique[val]) {
			// 			unique[val] = true;
			// 			return true;
			// 		}
			// 		return false;
			// 	}).sort();
			// }

		})
	})