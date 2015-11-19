(function() {

    var Ext = window.Ext4 || window.Ext;

    /**
     * @private
     */
    Ext.define('Rally.ui.gridboard.planning.TimeboxColumnProgressBar', {
        extend: 'Ext.Component',
        alias: 'widget.rallytimeboxcolumnprogressbar',
        requires: [
            'Rally.ui.renderer.template.progressbar.TimeboxProgressBarTemplate',
            'Rally.data.util.PortfolioItemHelper',
            'Rally.ui.popover.PlannedVelocityPopover'
        ],

        /**
         * @cfg {String} (required)
         * The field on a card's record that represents the number of points for the card
         */
        pointField: undefined,
        pointTotal: undefined,

        constructor: function(config) {
            this.callParent(arguments);
            this.renderTpl = Ext.create('Rally.ui.renderer.template.progressbar.TimeboxProgressBarTemplate', {
                height: '18px',
                width: '80%',
                offsetWidth: '10%',
                progressBarComponent: this
            });
            this.attribute = config.attribute;
        },

        update: function() {
            var html = this.renderTpl.apply(this._getRenderData());
            this.callParent([html]);
            this._getProgressBarContainer().on('click', this._onPlannedVelocityLinkClick, this);
            this._getProgressBarContainer().on('mouseenter', this._onProgressBarMouseEnter, this);
            this._getProgressBarContainer().on('mouseleave', this._onProgressBarMouseLeave, this);
            this._createTooltip();
            this._hideEditIcon();
        },

        _onProgressBarMouseEnter: function() {
            this._showEditIcon();
        },

        _onProgressBarMouseLeave: function() {
            this._hideEditIcon();
        },

        _onPlannedVelocityLinkClick: function(event) {
            event.preventDefault();

            this._disableTooltip();
            this._createPopoverWithData();
        },

        _createPopoverWithData: function() {
            var saveTimeboxRecord = Ext.bind(this._saveTimeboxRecord, this),
                enableTooltip = Ext.bind(this._enableTooltip, this);

            Ext.create('Rally.ui.popover.PlannedVelocityPopover', {
                plannedVelocity: this._getParentPlannedVelocityRollup(),
                childVelocity: this._getChildrenPlannedVelocityRollup(),
                hasChildren: this._hasChildren(),
                projectName: this._getProjectName(),
                releaseName: this._getReleaseName(),
                target: this._getProgressBarContainer(),
                unitName: this._getUnitName(),
                onSaveClicked: function() {
                    var plannedVelocity = Ext.getCmp('plannedVelocityField').getValue();
                    saveTimeboxRecord(plannedVelocity);
                    this.close();
                },
                onCancelClicked: function() {
                    enableTooltip();
                    this.close();
                },
                listeners: {
                    hide: function() {
                        this._enableTooltip();
                    },
                    close: function() {
                        this._enableTooltip();
                    },
                    scope: this
                }
            });
        },

        _showEditIcon: function() {
            this.getEl().down('.icon-edit').show();
        },

        _hideEditIcon: function() {
            this.getEl().down('.icon-edit').hide();
        },

        _getProject: function() {
            return Rally.environment.getContext().getProject();
        },

        _getWorkspace: function() {
            return Rally.environment.getContext().getWorkspace();
        },

        _getProjectName: function() {
            return this._getProject().Name;
        },

        _getUnitName: function() {
            var key = this.attribute.toLowerCase();
            return this._getWorkspace().WorkspaceConfiguration[this._getUnitKey(key)];
        },

        _getReleaseName: function() {
            return this._getParentTimebox().get('Name');
        },

        _hasChildren: function() {
            return this._getChildTimeboxes().length;
        },

        _getUnitKey: function(key) {
            var keyMap = {
                iteration: 'IterationEstimateUnitName',
                release: 'ReleaseEstimateUnitName'
            };
            return keyMap[key];
        },

        _saveTimeboxRecord: function(plannedVelocity) {
            var timeboxRecord = this._getParentTimebox();

            timeboxRecord.set('PlannedVelocity', plannedVelocity);
            timeboxRecord.save();
            this.update();
        },

        _disableTooltip: function() {
            this.tooltip.disable();
        },

        _enableTooltip: function() {
            this.tooltip.enable();
        },

        _createTooltip: function() {
            if (this.tooltip) {
                this._destroyTooltip();
            }

            this.tooltip = Ext.create('Rally.ui.tooltip.ToolTip', {
                cls: 'set-planned-velocity-tooltip',
                bodyStyle: 'text-align: center;',
                width: 150,
                anchor: 'top',
                target: this._getProgressBarContainer(),
                html: 'Edit Planned Velocity'
            });
        },

        _destroyTooltip: function() {
            this.tooltip.destroy();
            delete this.tooltip;
        },

        _getProgressBarContainer: function() {
            return this.getEl().down('.progress-bar-container');
        },

        _getColumn: function() {
            return this.column;
        },

        _getRenderData: function() {
            var totalPointCount = this._getTotalPointCount();
            var totalPlannedVelocity = this._getTotalPlannedVelocityRollup();
            var parentPlannedVelocity = this._getParentPlannedVelocityRollup();
            var childPlannedVelocity = this._getChildrenPlannedVelocityRollup();

            return {
                percentDone: totalPlannedVelocity ? totalPointCount / totalPlannedVelocity : 0,
                amountComplete:  totalPointCount,
                total: totalPlannedVelocity,
                parentVelocity: parentPlannedVelocity,
                childVelocity: childPlannedVelocity
            };
        },

        _getTotalPointCount: function() {
            if (this.pointTotal){
                return this.pointTotal;
            }

            return _.reduce(this._getColumn().getCards(), function(memo, card) {
                var points = this._getRecordValue(card.getRecord(), this.pointField);
                return Ext.isNumber(points) ? memo + points : memo;
            }, 0, this);
        },

        _getRecordValue: function (record, fieldName) {
            return _.isString(fieldName) && _.reduce(fieldName.split('.'), function (result, fieldName) {
                    if (result) {
                        return result.isModel ? result.get(fieldName) : result[fieldName];
                    }
                }, record);
        },

        _getParentTimebox: function() {
            var parent =  _.find(this._getTimeBoxRecords(), function(record) {
                return this._getProject()._refObjectUUID === record.get('Project')._refObjectUUID;
            }, this);
            return parent;
        },

        _getChildTimeboxes: function() {
            return _.filter(this._getTimeBoxRecords(), function(record) {
                return this._getProject()._refObjectUUID !== record.get('Project')._refObjectUUID;
            }, this);
        },

        _getTimeBoxRecords: function() {
            return this._getColumn().getTimeboxRecords();
        },

        _getRollup: function(collection, prop) {
            return _.reduce(collection, function(memo, record) {
                var plannedVelocity = record.get(prop);
                return Ext.isNumber(plannedVelocity) ? memo + plannedVelocity : memo;
            }, 0);
        },

        _getChildrenPlannedVelocityRollup: function() {
            return this._getRollup(this._getChildTimeboxes(), 'PlannedVelocity');
        },

        _getParentPlannedVelocityRollup: function() {
            var timeboxes = [];
            var parent = this._getParentTimebox();

            if(!parent) {
                return 0;
            }

            timeboxes.push(parent);

            return this._getRollup(timeboxes, 'PlannedVelocity');
        },

        _getTotalPlannedVelocityRollup: function() {
            return this._getRollup(this._getTimeBoxRecords(), 'PlannedVelocity');
        }

    });
})();