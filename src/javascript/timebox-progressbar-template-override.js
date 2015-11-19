(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * The Ext.XTemplate used to render the percent done of a timebox, like a iteration, release, or generic timeframe.
     */
    Ext.define('Rally.ui.renderer.template.progressbar.TimeboxProgressBarTemplate', {
        requires: [
            'Rally.util.Colors'
        ],
        extend: 'Rally.ui.renderer.template.progressbar.ProgressBarTemplate',

        config: {
            calculateColorFn: function(recordData) {
                if (recordData.percentDone < 0.8) {
                    return Rally.util.Colors.blue_med;
                } else if (recordData.percentDone <= 1) {
                    return Rally.util.Colors.lime;
                } else {
                    return Rally.util.Colors.red_med;
                }
            },
            generateAmountCompleteText: function(recordData) {
                return Ext.util.Format.round(recordData.amountComplete, 2);
            },
            generateChildrenTotalVelocityText: function(recordData) {
                return recordData.childVelocity ? '(' + Ext.util.Format.round(recordData.childVelocity, 2) + ')' : '';
            },
            generateTotalPlannedVelocityText: function(recordData) {
                // The progressbar links to "Set Planned Velocity" if there is no planned velocity for the current
                // project and iteration (the "parent"), so we check that even though the total is what gets displayed.
                return (recordData.parentVelocity && recordData.total) ? Ext.util.Format.round(recordData.total, 2) : '<a href="#">Set Planned Velocity</a>';
            },
            calculatePercent: function(recordData) {
                var percentDone = recordData[this.percentDoneName];
                var totalPlannedVelocity = recordData.total;

                if(_.isNaN(percentDone) || totalPlannedVelocity === 0) {
                    return '--';
                } else {
                    return Math.round(percentDone * 100);
                }
            },
            getOffsetDimensions: function() {
                return 'width:' + this.offsetWidth + ';display: inline-block; color: white; text-align: center; vertical-align: top; line-height: 18px;';
            }
        },

        template: [
            '<tpl if="this.shouldShowPercentDone(values)">',
            '<div style="{[this.getOffsetDimensions()]}"></div>',
            '<div class="progress-bar-container field-{[this.percentDoneName]} {[this.getClickableClass()]} {[this.getContainerClass(values)]}" style="cursor: pointer; {[this.getDimensionStyle()]}">',
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

        constructor: function(config) {
            config.template = this.template;
            this.initConfig(config);
            return this.callParent(arguments);
        },

        apply: function(values, parent) {
            var html = this.callParent(arguments);
            return html === '' ? html : '<div class="progress-bar-background">' + html + '</div>';
        }
    });
})();