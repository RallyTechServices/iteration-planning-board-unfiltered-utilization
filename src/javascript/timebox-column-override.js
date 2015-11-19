(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * @private
     */
    Ext.define('Rally.ui.gridboard.planning.TimeboxColumn', {
        extend: 'Rally.ui.cardboard.Column',
        alias: 'widget.rallytimeboxcolumn',

        config: {
            /**
             * @cfg {String}
             * The name of the field inside the record that stores the start date
             */
            startDateField: 'StartDate',

            /**
             * @cfg {String}
             * The name of the field inside the record that stores the end date
             */
            endDateField: 'EndDate',

            /**
             * @cfg {Rally.data.wsapi.Model[]}
             * The timebox records (Iteration or Release) for this column
             */
            timeboxRecords: [],

            /**
             * @cfg {Object} columnStatusConfig
             * A config object that will be applied to the column's status area (between the header and content cells).
             * Used here for the progress bar.
             */
            columnStatusConfig: {
                xtype: 'rallytimeboxcolumnprogressbar',
                pointField: 'PlanEstimate',
                pointTotal: null
            }
        },

        cls: 'column',

        currentTimeboxCls: 'current-timebox',

        requires: [
            'Ext.XTemplate',
            'Rally.ui.gridboard.planning.TimeboxColumnProgressBar'
        ],

        constructor: function(config) {
            this.mergeConfig(config);
            this.config = Ext.merge({
                columnHeaderConfig: {
                    record: this._getTimeboxRecord(),
                    fieldToDisplay: 'Name',
                    editable: false
                }
            }, this.config);
            this.config.value = Rally.util.Ref.getRelativeUri(this._getTimeboxRecord());
            this.callParent([this.config]);
        },

        initComponent: function() {
            this.additionalFetchFields = _(this.additionalFetchFields || []).concat(
                _.first(this.columnStatusConfig.pointField.split('.'))
            ).unique().value();

            this.callParent(arguments);

            this.on({
                beforecarddroppedsave:  this._onBeforeCardDrop,
                addcard:                this._updateColumnStatus,
                load:                   this._updateColumnStatus,
                removecard:             this._updateColumnStatus,
                cardupdated:            this._updateColumnStatus,
                afterrender: {
                    fn: this._addPlanningClasses,
                    single: true
                },
                scope: this
            });

            this._loadUnfilteredStore();

        },
        _loadUnfilteredStore: function(){
            var filter = this.getStoreFilter(),
                pointField = this.columnStatusConfig.pointField,
                context = this.context.getDataContext();

            var store =  Ext.create('Rally.data.wsapi.artifact.Store', {
                models: ['HierarchicalRequirement','Defect'],
                filters: filter,
                context: context,
                fetch: [pointField]
            });
            store.load({
                callback: function(records, operation){
                    console.log('_loadUnfilteredStore callback', operation, records);
                    if (operation.wasSuccessful()){
                        var totalPoints = 0;

                        _.each(records, function(r){
                            totalPoints += r.get(pointField) || 0;
                        });
                    } else {
                        totalPoints = -1;
                        Rally.ui.notify.Notifier.showError({message: "Error fetching capacity total for unfiltered values."});
                    }
                    this.columnStatusConfig.pointTotal = totalPoints;
                    this._updateColumnStatus();
                },
                scope: this
            });


        },
        _updateColumnStatus: function() {
            if(this.columnStatus) {
                this.columnStatus.pointTotal = this.columnStatusConfig.pointTotal;  //Added to show total unfiltered points
                this.columnStatus.update();
            } else {
                this.drawStatus();
                this._updateColumnStatus();
            }
        },

        getStoreFilter: function(model) {
            return [
                {
                    property: this._getTimeboxModelName() + ".Name",
                    value: this._getTimeboxRecord().get('Name')
                },
                {
                    property: this._getTimeboxModelName() + "." + this.startDateField,
                    value: Rally.util.DateTime.toIsoString(this._getTimeboxRecord().get(this.startDateField))
                },
                {
                    property: this._getTimeboxModelName() + "." + this.endDateField,
                    value: Rally.util.DateTime.toIsoString(this._getTimeboxRecord().get(this.endDateField))
                }
            ];
        },

        getColumnStatus: function() {
            return this.columnStatus;
        },

        getStatusCell: function() {
            return Ext.get(this.statusCell);
        },

        isMatchingRecord: function(record) {
            return _.some(this.timeboxRecords, function(timeboxRecord) {
                return Rally.util.Ref.getOidFromRef(record.get(this._getTimeboxModelName())) === timeboxRecord.get('ObjectID');
            }, this);
        },

        afterRender: function() {
            this.callParent(arguments);
            this.drawStatus();
        },

        drawHeader: function() {
            this.callParent(arguments);
            this._addTimeboxDates();
        },

        drawStatus: function() {
            if (this.columnStatusConfig && !this.getColumnStatus()) {
                this.columnStatus = Ext.widget(Ext.merge({
                    renderTo: this.getStatusCell(),
                    column: this,
                    attribute: this.config.attribute
                }, this.columnStatusConfig));
            }
        },

        _addTimeboxDates: function() {
            this.getColumnHeader().add({
                xtype: 'component',
                html: this.getTimeboxDatesTpl().apply(this.getTimeboxDatesTplData())
            });
        },

        getTimeboxDatesTpl: function() {
            this.timeboxDatesTpl = this.timeboxDatesTpl || Ext.create('Ext.XTemplate',
                    '<div class="timeboxDates">{formattedStartDate} - {formattedEndDate}</div>');

            return this.timeboxDatesTpl;
        },

        getTimeboxDatesTplData: function() {
            return {
                formattedStartDate: this._getFormattedDate(this.startDateField),
                formattedEndDate: this._getFormattedDate(this.endDateField)
            };
        },

        getProgressBar: function() {
            return this.getColumnStatus();
        },

        _getFormattedDate: function(fieldName) {
            return Rally.util.DateTime.formatWithDefault(this._getTimeboxRecord().get(fieldName));
        },

        _getTimeboxRecord: function() {
            return this.timeboxRecords[0];
        },

        _getTimeboxModelName: function() {
            return this._getTimeboxRecord().self.displayName;
        },

        _onBeforeCardDrop: function(column, card) {
            var cardProjectRef = Rally.util.Ref.getRelativeUri(card.getRecord().get('Project'));
            if (cardProjectRef !== Rally.util.Ref.getRelativeUri(column.context.getProject())) {

                if (!Ext.Array.some(this.timeboxRecords, function(timeboxRecord) {
                        return cardProjectRef === Rally.util.Ref.getRelativeUri(timeboxRecord.get('Project'));
                    })) {
                    card.getRecord().set('Project', column.context.getProject()._ref);
                }
            }
        },

        _isCurrentTimebox: function(){
            var now = new Date();
            return this._getTimeboxRecord().get(this.startDateField) <= now && this._getTimeboxRecord().get(this.endDateField) >= now;
        },

        _addPlanningClasses: function() {
            var cls = 'planning-column';
            if (this._isCurrentTimebox()) {
                cls += ' ' + this.currentTimeboxCls;

            }
            _.invoke(this.getContentCellContainers(), 'addCls', cls);
            this.getStatusCell().addCls(cls);
            this.getColumnHeaderCell().addCls(cls);
        }
    });
})();