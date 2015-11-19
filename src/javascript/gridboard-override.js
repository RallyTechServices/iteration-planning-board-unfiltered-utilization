(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * A wrapper component that displays a grid and/or a board.
     * This component is enhanced via plugins to add functionality like add new, field/column selection, filtering and toggling between grid and board views.
     *
     *     Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
     *           models: ['userstory'],
     *           autoLoad: true,
     *           enableHierarchy: true
     *       }).then({
     *           success: function(store) {
     *               Ext.create('Ext.Container', {
     *                   items: [{
     *                       xtype: 'rallygridboard',
     *                       context: this.getContext(),
     *                       modelNames: ['userstory'],
     *                       toggleState: 'grid',
     *                       plugins: [
     *                           'rallygridboardtoggleable'
     *                       ],
     *                       cardBoardConfig: {
     *                           attribute: 'ScheduleState'
     *                       },
     *                       gridConfig: {
     *                           store: store,
     *                           columnCfgs: [
     *                               'Name',
     *                               'ScheduleState',
     *                               'Owner',
     *                               'PlanEstimate'
     *                           ]
     *                       },
     *                       height: this.getHeight()
     *                   }]
     *               });
     *           }
     *       });
     *
     * More examples of using this component and its plugins may be found in the [Examples](#!/example) section.
     */
    Ext.define('Rally.ui.gridboard.GridBoard', {
        extend: 'Ext.Container',
        mixins: ['Rally.app.Scopeable'],
        requires: [
            'Rally.ui.LeftRight',
            'Rally.ui.gridboard.GridBoardToggle',
            'Rally.ui.cardboard.CardBoard',
            'Rally.ui.grid.TreeGrid',
            'Rally.ui.gridboard.plugin.GridBoardCustomView',
            'Rally.data.filter.FilterCollection'
        ],

        alias: 'widget.rallygridboard',
        cls: 'rui-gridboard',

        /**
         * @cfg {Object}
         * Config passed into cardboard.
         */
        cardBoardConfig: {},

        /**
         * @cfg {Object}
         * Config passed into grid.
         */
        gridConfig: {},

        /**
         * @cfg {Object}
         * Common store configuration properties
         * to be applied to both the board and grid views
         */
        storeConfig: {},

        /**
         * @cfg {Array}
         * An array of model names of types to view on the grid board.
         */
        modelNames: [],

        /**
         * @cfg {String}
         * Used to configure plugins and child components that require a stateId
         */
        stateId: 'gridboard',

        /**
         * @inheritdoc
         * If the board is not meant to be toggled, state should be disabled to prevent the chance for gridboard
         * to load in an invalid state
         */
        stateful: true,

        /**
         * @cfg {String}
         * Which component to show- grid or board
         */
        toggleState: 'grid',

        /**
         * @inheritdoc
         */
        layout: {
            type: 'auto'
        },

        items: [
            {
                itemId: 'header',
                xtype: 'rallyleftright',
                padding: '4 10',
                overflowX: 'hidden'
            }
        ],

        /**
         * @deprecated
         *
         * Do not set this to true for new things
         */
        useFilterCollection: true,

        initComponent: function() {
            this.plugins = this.plugins || [];
            this.stateId = this.getAppContextOrEnvironmentContext().getScopedStateId(this.stateId);

            this.callParent(arguments);

            this.addEvents([
            /**
             * @event toggle
             * Fires when the toggle value is changed.
             * @param {String} toggleState 'grid' or 'board'.
             * @param {Ext.Component} gridOrBoard grid or board component.
             */
                'toggle',
            /**
             * @event load
             * Fires when the data store for the grid or board has loaded.
             * @param {Rally.ui.gridboard.GridBoard} this
             */
                'load',
            /**
             * @event recordcreate
             * Fires when a new record is created.
             * @param {Ext.data.Record} record The record that was created.
             */
                'recordcreate',
            /**
             * @event recordupdate
             * Fires when a record is updated.
             */
                'recordupdate',
            /**
             * @event preferencesaved
             * Fires after the preference has been saved
             * @param {Rally.data.wsapi.Model} record for preference
             */
                'preferencesaved',
            /**
             * @event modeltypeschange
             * Fires when the model types of the gridboard are changed.
             */
                'modeltypeschange'
            ]);

            this.on('modeltypeschange', function (gridboard, types) {
                this.modelNames = types;
            }, this);
        },

        /**
         * Delay the addition of the grid or board until plugins had a chance to modify some state
         * and the header has rendered in order to set the height of the tree grid.
         * Plugins can modify things like what fields are displayed
         * @private
         */
        afterRender: function() {
            this.callParent(arguments);
            this._addGridOrBoard(this.getToggleState());
        },

        applyState: function (state) {
            this.toggleState = state.toggleState;
        },

        getState: function () {
            return {
                toggleState: this.getToggleState()
            };
        },

        destroy: function() {
            var grid = null;

            if (this.getToggleState() === 'grid') {
                grid = this.getGridOrBoard();
                if (grid && grid.store && _.isFunction(grid.store.clearData)) {
                    //clean up records in the store to free up memory
                    grid.store.clearData();
                }
            }

            this.callParent(arguments);
        },

        setToggleState: function (toggleState) {
            if (this.toggleState !== toggleState) {
                this.toggleState = toggleState;
                this.saveState();
                if (this.down('#gridOrBoard')) {
                    this.remove('gridOrBoard', true);
                }
                this._addGridOrBoard(toggleState);
            }
        },

        getToggleState: function () {
            return this.toggleState;
        },

        /**
         * Get the header
         * @return {Rally.ui.LeftRight}
         */
        getHeader: function() {
            return this.down('#header');
        },

        /**
         * Get the currently shown grid or board component
         * @return {Rally.ui.cardboard.CardBoard|Rally.ui.grid.Grid}
         */
        getGridOrBoard: function() {
            return this.down('#gridOrBoard');
        },

        /**
         * Get the names of the artifacts currently shown
         * @returns {String[]}
         */
        getModelNames: function() {
            return this.modelNames;
        },

        /**
         * Get the models of the artifacts currently shown
         * @returns {Rally.data.Model[]}
         */
        getModels: function() {
            return this.getGridOrBoard().getModels();
        },

        applyCustomFilter: function(filterObj) {
            var gridOrBoard = this.getGridOrBoard();

            this.currentCustomFilter = filterObj;

            if (gridOrBoard) {
                if (this.getToggleState() === 'board') {
                    this._applyBoardFilters(gridOrBoard, filterObj);
                } else {
                    this._applyGridFilters(gridOrBoard, filterObj);
                }
            }
        },

        /**
         * Configure filters. Filters can be {Ext.util.Filter} instances or filter config objects.
         *
         * @deprecated DO NOT USE THIS!  THIS WILL BE DELETED, THIS IS NOT THE RIGHT WAY TO FILTER ANY MORE
         *             Please use applyCustomFilter (above) instead
         *
         * @param {Ext.util.Filter|Ext.util.Filter[]|Object|Object[]} filter
         * @param {String[]} clearFilterKeys
         */
        setFilter: function(filter, clearFilterKeys) {
            var gridOrBoard = this.getGridOrBoard();

            if (gridOrBoard) {
                gridOrBoard.filter(filter, clearFilterKeys);
            }
        },

        /**
         * Returns the currently applied filter.
         *
         * @returns {Ext.util.Filter|Ext.util.Filter[]|Object|Object[]}
         */
        getFilter: function() {
            return this.currentFilter;
        },

        setHeight: function() {
            this.callParent(arguments);
            var gridOrBoard = this.getGridOrBoard();
            if(gridOrBoard && gridOrBoard.rendered && gridOrBoard.getHeight() !== this.getAvailableGridBoardHeight()) {
                this.getGridOrBoard().setHeight(this.getAvailableGridBoardHeight());
            }
        },

        _addGridOrBoard: function(toggleState) {
            var gridOrBoard = null;

            if (toggleState === 'board') {
                gridOrBoard = this._addBoard();
            } else if (toggleState === 'grid') {
                gridOrBoard = this._addGrid();
            }

            this.fireEvent('toggle', toggleState, gridOrBoard, this);
        },

        _addBoard: function() {
            var board = this.add(this._getBoardConfig());
            this.mon(board, 'load', this._onGridOrBoardLoad, this);
            this.mon(board, 'cardupdated', this._onCardUpdated, this);
            this.mon(board, 'cardcopied', this._onCardCopied, this);
            return board;
        },

        /**
         * @private
         */
        getAvailableGridBoardHeight: function() {
            return this.getHeight() - this.down('#header').getHeight() - 10;
        },

        _getBoardConfig: function() {
            var config = Ext.merge({
                itemId: 'gridOrBoard',
                xtype: 'rallycardboard',
                types: this.modelNames,
                attribute: 'ScheduleState',
                storeConfig: {},
                context: this.getContext(),
                cls: 'cardboard',
                cardConfig: {
                    componentCls: 'iterationtrackingboard-card',
                    editable: true,
                    showColorIcon: true
                },
                height: this.getAvailableGridBoardHeight()
            }, this.cardBoardConfig);

            this._setBoardConfigFilters(config);

            return config;
        },

        _setBoardConfigFilters: function(config){
            _.merge(config, {storeConfig: this.storeConfig});

            if(this.useFilterCollection) {
                config.filterCollection = this._getFilterCollection(config.storeConfig && config.storeConfig.filters);
            } else {
                var filters = [].concat(config.storeConfig.filters || []);
                if(this.currentCustomFilter) {
                    filters = filters.concat(this.currentCustomFilter.filters || []);
                }
                config.storeConfig.filters = filters;
                if (this.currentCustomFilter && this.currentCustomFilter.types) {
                    config.types = this.currentCustomFilter.types;
                }
            }
        },

        _getGridConfig: function() {
            var context = this.getContext() || Rally.environment.getContext(),
                config =  Ext.merge({
                    itemId: 'gridOrBoard',
                    xtype: 'rallytreegrid',
                    context: context,
                    enableRanking: context.getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled,
                    defaultSortToRank: true,
                    enableBlockedReasonPopover: true,
                    stateId: this.stateId + '-grid',
                    stateful: true,
                    height: this.getAvailableGridBoardHeight()
                }, this.gridConfig);

            if (_.isEmpty(config.store)) {
                Ext.Error.raise('No grid store configured');
            }

            if (this.useFilterCollection) {
                config.filterCollection = this._getFilterCollection(this._getConfiguredFilters());
            }

            return config;
        },

        _getConfiguredFilters: function(extraFilters, types) {
            var isBoard = this.getToggleState() === 'board',
                filters =  _.compact(Ext.Array.merge(
                    this.storeConfig && this.storeConfig.filters,
                    isBoard && this.cardBoardConfig.storeConfig && this.cardBoardConfig.storeConfig.filters,
                    !isBoard && this.gridConfig.storeConfig && this.gridConfig.storeConfig.filters,
                    extraFilters));

            // don't do this if not artifact model or we are using filter collection
            if (!this.useFilterCollection && _.isFunction(this.getModels()[0].getArtifactComponentModel)) {
                filters = Rally.util.Filter.removeNonapplicableTypeSpecificFilters(filters, types, this.getModels()[0]);
            }

            return filters;
        },

        _addGrid: function() {
            var grid = this.add(this._getGridConfig());
            this.mon(grid, 'afterproxyload', this._onGridOrBoardLoad, this);
            if (!this.useFilterCollection && this.currentCustomFilter) {
                this._applyGridFilters(grid, this.currentCustomFilter);
            }
            return grid;
        },

        _applyGridFilters: function(grid, filterObj) {
            if (!_.isEmpty(filterObj.types)) {
                grid.store.parentTypes = filterObj.types;
            }
            grid.store.clearFilter(true);
            grid.store.filter(this._getConfiguredFilters(filterObj.filters || [], filterObj.types || []));
        },

        _applyBoardFilters: function(board, filterObj) {
            board.refresh({
                types: filterObj.types,
                storeConfig: {filters: this._getConfiguredFilters(filterObj.filters || [], filterObj.types || [])}
            });
        },

        _onGridOrBoardLoad: function() {
            this.fireEvent('load', this);

            if (Rally.BrowserTest) {
                Rally.BrowserTest.publishComponentReady(this);
            }
        },

        _onCardCopied: function(cmp, record) {
            this.fireEvent('recordcreate', record);
        },

        _onCardUpdated: function(card) {
            this.fireEvent('recordupdate', card.getRecord());
        },

        /**
         * @deprecated
         *
         * @private
         * Create a new filter collection
         *
         * @param {Ext.util.Filter[]} filters Permanent filters to be added to filter collection on creation
         */
        _getFilterCollection: function(filters) {
            var filterCollection = Ext.create('Rally.data.filter.FilterCollection');

            if (filters) {
                filterCollection.addPermanentFilter(filters);
            }

            return filterCollection;
        }
    });
})();