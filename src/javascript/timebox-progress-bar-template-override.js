(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * The Ext.XTemplate used to render the percent done of a timebox, like a iteration, release, or generic timeframe.
     */
    Ext.override(Rally.ui.renderer.template.progressbar.TimeboxProgressBarTemplate, {

        template: [
            '<tpl if="this.shouldShowPercentDone(values)">',
            '<div style="{[this.getOffsetDimensions()]}"></div>',
            '<div class="progress-bar-container field-{[this.percentDoneName]} {[this.getClickableClass()]} {[this.getContainerClass(values)]}" style="{[this.getDimensionStyle()]}">',
            '<div class="rly-progress-bar" style="background-color: {[this.calculateColorFn(values)]}; width: {[this.calculateWidth(values)]}; "></div>',
            '<tpl if="this.showDangerNotificationFn(values)">',
            '<div class="progress-bar-danger-notification"></div>',
            '</tpl>',
            '<div class="progress-bar-label">',
            '{[this.generateAmountCompleteText(values)]}',
            ' of ',
            '{[this.generateTotalPlannedVelocityText(values)]}',
            ' {[this.generateChildrenTotalVelocityText(values)]} ',
            '<span class="icon-edit" style="position:relative; top: 1px;"></span>',
            '</div>',
            '</div>',
            '<div style="{[this.getOffsetDimensions()]}">',
            '<span class="progressbar-percentage">{[this.calculatePercent(values)]}%</span>',
            '</div>',
            '</tpl>'
        ],

        config: {
            generateTotalPlannedVelocityText: function(recordData) {
                // The progressbar links to "Set Planned Velocity" if there is no planned velocity for the current
                // project and iteration (the "parent"), so we check that even though the total is what gets displayed.
                return (recordData.total) ? Ext.util.Format.round(recordData.total, 2) : '--';
            }
        }
    });
})();