(function() {

    var Ext = window.Ext4 || window.Ext;

    /**
     * @private
     */
    Ext.override(Rally.ui.gridboard.planning.TimeboxColumnProgressBar, {
        pointTotal: undefined,

        _getTotalPointCount: function() {
            if (this.pointTotal){
                return this.pointTotal;
            }

            return _.reduce(this._getColumn().getCards(), function(memo, card) {
                var points = this._getRecordValue(card.getRecord(), this.pointField);
                return Ext.isNumber(points) ? memo + points : memo;
            }, 0, this);
        }
    });
})();