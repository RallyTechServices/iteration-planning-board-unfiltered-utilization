(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * @private
     */
    Ext.define('Rally.ui.gridboard.planning.TimeboxGridBoard', {
        extend: 'Rally.ui.gridboard.GridBoard',
        alias: 'widget.rallytimeboxgridboard',
        requires: [
            'Rally.util.Array',
            'Rally.data.ModelFactory',
            'Rally.ui.gridboard.TimeboxBlankSlate',
            'Rally.ui.gridboard.planning.BacklogColumn',
            'Rally.ui.gridboard.planning.TimeboxCardBoard',
            'Rally.ui.gridboard.planning.TimeboxColumn',
            'Rally.ui.gridboard.planning.TimeboxScrollable'
        ],
        mixins: ['Rally.Messageable'],

        cls: 'rui-gridboard planning-board',

        /**
         * @cfg {String}
         * The name of the field inside the record that stores the end date
         */
        endDateField: 'EndDate',

        /**
         * @cfg {Number}
         */
        numColumns: 3,

        /**
         * @cfg {String}
         * The name of the field inside the record that stores the start date
         */
        startDateField: 'StartDate',

        /**
         * @cfg {String} (required)
         * Either 'Iteration' or 'Release'
         */
        timeboxType: undefined,

        toggleState: 'board',

        initComponent: function() {
            this.on('toggle', function(toggleState, gridOrBoard) {
                if (toggleState === 'board' && !this._hasTimeboxes()) {
                    this.mon(gridOrBoard, 'aftercolumnrender', this._addBoardBlankSlate, this);
                }
            }, this);

            this.subscribe(this, Rally.Message.objectCreate, this._onObjectChange, this);
            this.subscribe(this, Rally.Message.objectUpdate, this._onObjectChange, this);
            this.subscribe(this, Rally.Message.objectDestroy, this._onObjectChange, this);

            this.callParent(arguments);
        },

        _addGridOrBoard: function() {
            if (!this.timeboxes) {
                Rally.data.ModelFactory.getModel({
                    type: this.timeboxType,
                    context: this.getContext().getDataContext(),
                    success: this._findTimeboxes,
                    scope: this
                });
                this.setLoading(true);
            } else {
                this.callParent(arguments);
            }
        },

        _getBoardConfig: function() {
            var initiallyVisibleTimeboxes = this._getInitiallyVisibleTimeboxes();
            var columns = this._getColumnConfigs(initiallyVisibleTimeboxes);
            return Ext.merge(this.callParent(arguments), {
                xtype: 'rallytimeboxcardboard',
                attribute: this.timeboxType,
                cardConfig: {
                    showBlockedReason: true,
                    showIconMenus: true
                },
                columns: columns,
                columnConfig: {
                    xtype: 'rallytimeboxcolumn',
                    endDateField: this.endDateField,
                    startDateField: this.startDateField,
                    storeConfig : {
                        fetch: ['Parent', 'Requirement'],
                        pageSize: Ext.isIE ? 25 : 100 // plan estimate rollups use client side data, so we need a lot of cards
                    }
                },
                plugins: [
                    {
                        ptype: 'rallytimeboxscrollablecardboard',
                        backwardsButtonConfig: {
                            elTooltip: 'Previous ' + this.timeboxType
                        },
                        columnRecordsProperty: 'timeboxRecords',
                        forwardsButtonConfig: {
                            elTooltip: 'Next ' + this.timeboxType
                        },
                        getFirstVisibleScrollableColumn: function(){
                            return this.getScrollableColumns()[0];
                        },
                        getLastVisibleScrollableColumn: function(){
                            return _.last(this.getScrollableColumns());
                        },
                        getScrollableColumns: function(){
                            return Ext.Array.slice(this.cmp.getColumns(), 1, this.cmp.getColumns().length);
                        }
                    }
                ],
                scrollableColumnRecords: this.timeboxes
            });
        },

        _getInitiallyVisibleTimeboxes: function(){
            if(this.timeboxes.length <= this.numColumns){
                return this.timeboxes;
            }

            var previousTimeboxes = [];
            var futureAndCurrentTimeboxes = [];
            Ext.Array.each(this.timeboxes, function (timeboxRecords) {
                if (timeboxRecords[0].get(this.endDateField) >= new Date()) {
                    futureAndCurrentTimeboxes.push(timeboxRecords);
                } else {
                    previousTimeboxes.push(timeboxRecords);
                }
            }, this);
            futureAndCurrentTimeboxes = Rally.util.Array.firstElementsOf(futureAndCurrentTimeboxes, this.numColumns);

            var possiblyVisibleTimeboxes = previousTimeboxes.concat(futureAndCurrentTimeboxes);
            return Rally.util.Array.lastElementsOf(possiblyVisibleTimeboxes, this.numColumns);
        },

        _getColumnConfigs: function(timeboxes) {
            var columns = [{
                xtype: 'rallyplanningbacklogcolumn',
                flex: this._hasTimeboxes() ? 1 : 1/3,
                columnHeaderConfig: {
                    headerTpl: 'Backlog'
                }
            }];

            Ext.Array.each(timeboxes, function(timeboxRecords) {
                columns.push({
                    columnHeaderConfig: {
                        record: timeboxRecords[0],
                        fieldToDisplay: 'Name',
                        editable: false
                    },
                    timeboxRecords: timeboxRecords
                });
            }, this);

            return columns;
        },

        _hasTimeboxes: function() {
            return this.timeboxes && this.timeboxes.length > 0;
        },

        _findTimeboxes: function(model) {
            Ext.create('Rally.data.wsapi.Store', {
                model: model,
                fetch: ['Name', this.startDateField, this.endDateField, 'Project', 'PlannedVelocity'],
                autoLoad: true,
                listeners: {
                    load: this._onTimeboxesLoad,
                    scope: this
                },
                context: this.getContext().getDataContext(),
                limit: Infinity
            });
        },

        _addBoardBlankSlate: function(board) {
            this.addCls('no-timebox');
            board.getEl().down('.columns tr td').setStyle('width', '33%');
            var blankSlateTd = Ext.DomHelper.append(board.getEl().down('.columns tr'), '<td class="blank-slate-column"></td>', true);

            var blankSlate = Ext.widget({
                xtype: 'rallytimeboxblankslate',
                timeboxType: this.timeboxType,
                context: this.getContext(),
                renderTo: blankSlateTd
            });

            this.on('destroy', function() {
                blankSlate.destroy();
            });

            if (Rally.BrowserTest) {
                Rally.BrowserTest.publishComponentReady(this);
            }
        },

        _onTimeboxesLoad: function(store) {
            var likeTimeboxesObj = {};
            store.each(function(timebox) {
                var timeboxKey = Ext.String.format("{0}{1}{2}", timebox.get('Name'), timebox.get(this.startDateField), timebox.get(this.endDateField));
                likeTimeboxesObj[timeboxKey] = Ext.Array.push(likeTimeboxesObj[timeboxKey] || [], timebox);
            }, this);

            var sortedLikeTimeboxes = _.sortBy(Ext.Object.getValues(likeTimeboxesObj), function(likeTimeboxes) {
                return likeTimeboxes[0].get(this.endDateField);
            }, this);

            this.timeboxes = Ext.Array.filter(sortedLikeTimeboxes, function(likeTimeboxes) {
                return Ext.Array.some(likeTimeboxes, function(timebox) {
                    return Rally.util.Ref.getRelativeUri(timebox.get('Project')) === Rally.util.Ref.getRelativeUri(this.getContext().getProject());
                }, this);
            }, this);

            this.setLoading(false);
            this._addGridOrBoard('board');
        },

        _onObjectChange: function(record) {
            if (Ext.isArray(record)) {
                Ext.Array.each(record, this._onObjectChange, this);
                return;
            }

            if (record.get('_type').toLowerCase() === this.timeboxType.toLowerCase()) {
                var gridOrBoard = this.getGridOrBoard();
                if (gridOrBoard) {
                    gridOrBoard.destroy();
                }

                this.timeboxes = null;
                this._addGridOrBoard();
            }
        }
    });
})();