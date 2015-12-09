(function() {

    var Ext = window.Ext4 || window.Ext;

    /**
     * @private
     */
    Ext.override(Rally.ui.gridboard.planning.TimeboxColumnProgressBar, {
        pointTotal: undefined,
        allowEdit: false,
        _getTotalPointCount: function() {
            if (this.pointTotal){
                return this.pointTotal;
            }

            return _.reduce(this._getColumn().getCards(), function(memo, card) {
                var points = this._getRecordValue(card.getRecord(), this.pointField);
                return Ext.isNumber(points) ? memo + points : memo;
            }, 0, this);
        },
        _showEditIcon: function() {
           if (this.allowEdit){
               this.getEl().down('.icon-edit').show();
           }
        },
        _createTooltip: function(){
            if (!this.allowEdit){
                return;
            }

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
        _onPlannedVelocityLinkClick: function(event) {
            event.preventDefault();

          if (this.allowEdit){
              this._disableTooltip();
              this._createPopoverWithData();
          }

        }
    });
})();