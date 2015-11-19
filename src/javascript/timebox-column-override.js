(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * @private
     */
    Ext.override(Rally.ui.gridboard.planning.TimeboxColumn, {

            /**
             * @cfg {Object} columnStatusConfig
             * A config object that will be applied to the column's status area (between the header and content cells).
             * Used here for the progress bar.
             */
            columnStatusConfig: {
                xtype: 'rallytimeboxcolumnprogressbar',
                pointField: 'PlanEstimate',
                pointTotal: null
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
                    //console.log('_loadUnfilteredStore callback', operation, records);
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
        }
    });
})();