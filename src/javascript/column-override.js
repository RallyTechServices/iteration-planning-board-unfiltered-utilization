(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * The base column implementation.
     *
     * In general, this class will not be created directly but instead will be instantiated by Rally.ui.cardboard.CardBoard
     * as specified by its columnConfig:
     *
     *     columnConfig: {
     *         xtype: 'rallycardboardcolumn'
     *     }
     */
    Ext.define('Rally.ui.cardboard.Column', {
        extend: 'Ext.Component',
        alias: 'widget.rallycardboardcolumn',

        requires: [
            'Rally.util.Array',
            'Rally.util.Ui',
            'Rally.ui.cardboard.plugin.ColumnDropController',
            'Rally.ui.cardboard.Card',
            'Rally.ui.cardboard.ColumnHeader',
            'Rally.ui.cardboard.CardRecordProcessor',
            'Rally.util.Ref',
            'Rally.ui.cardboard.plugin.ColumnWIP',
            'Rally.util.SafeExting',
            'Rally.util.Test',
            'Rally.ui.cardboard.CardFieldFetch',
            'Rally.data.wsapi.Filter',
            'Rally.data.Ranker',
            'Deft.Promise'
        ],

        mixins: {
            messageable: 'Rally.Messageable',
            datastoreCreateable: 'Rally.data.DataStoreCreateable',
            filterable: 'Rally.data.filter.StoreFilterable', // DEPRECATED!  DO NOT CALL METHODS MIXED IN HERE.
            clientMetrics: 'Rally.clientmetrics.ClientMetricsRecordable'
        },

        inheritableStatics: {
            HIDDEN_CLS: 'rly-hidden'
        },

        /**
         * @property {String} cls The base class applied to this object's element
         */
        cls: 'column',

        clientMetrics: [
            {
                beginMethod: '_queryForData',
                endEvent: 'load',
                description: 'column loaded'
            },
            {
                beginMethod: 'loadMoreRecords',
                endMethod: '_onStoreLoad',
                description: 'autoload records'
            }
        ],

        /**
         * @property {Ext.Component} columnHeader The header for the column.
         */
        columnHeader: null,

        /**
         * @property {Rally.ui.cardboard.Cardboard}
         * The Cardboard the Column belongs to.
         */
        ownerCardboard: null,

        config: {
            /**
             * @cfg {Object} cardConfig
             * A config object that will be applied to the column's cards.  Any of the config options available for Rally.ui.cardboard.Card can be specified here.
             */
            cardConfig: {
                xtype: 'rallycard'
            },
            /**
             * @cfg {Object} columnHeaderConfig
             * A config object that will be applied to the column's header.  Any of the config options available for Rally.ui.cardboard.ColumnHeader can be specified here.
             */
            columnHeaderConfig: {
                xtype: 'rallycardboardcolumnheader'
            },

            /**
             * @cfg {Boolean} enableWipLimit If set to true will add the ColumnWip plugin to this column
             */
            enableWipLimit: false,

            /**
             *  @cfg {Number} wipLimit
             *  The maximum wip allowed in this column. A value of -1 is is equivalent to a wip of infinity.
             */
            wipLimit: -1,

            /**
             *  @cfg {Boolean/String/Number} value (required)
             *  The value that will be assigned to the card's record when it is dropped into this column.
             */
            value: undefined,

            /**
             *  @cfg {String} valueField
             *  The record field that will be the value that will be assigned to the card's record when it is dropped into this column.
             */
            valueField: undefined,

            /**
             *  @cfg {String} displayField
             *  The record field that that will be displayed in the header of the column
             *  This is only used by KanbanPolicy, not by PKPolicy
             */
            displayField: undefined,

            /**
             *  @cfg {Object} record
             *  The record for the column that is being added to the cardboard
             */
            record: undefined,

            /**
             * @cfg {Boolean} enableCrossColumnRanking If set to true will allow the cards to be reranked when dropped into a new column.
             */
            enableCrossColumnRanking: false,

            /**
             * @cfg {Boolean} enableRanking (required)
             * Set to true if the workspace is drag and drop enabled.
             */
            enableRanking: true,

            /**
             * @cfg {Boolean}
             * Set to false to disable drag and drop across rows.
             */
            enableCrossRowDragging: true,

            /**
             * @cfg {Boolean} dropControllerConfig
             * Plugin config object for a drop controller plugin. Set to true to use the default
             * {Rally.ui.cardboard.plugin.ColumnDropController} plugin, or set to false to disable
             * dropping in this column.
             */
            dropControllerConfig: true,

            /**
             * @cfg {Number}
             * The minimum number of cards that will be auto loaded off screen.
             * If this threshold is not met, then another page of cards will be automatically loaded.
             */
            autoLoadCardThreshold: 5,

            /**
             * @cfg {Number}
             * The amount of milliseconds to wait before calculating whether an auto load is required
             * whenever an event occurs, such as scrolling, that could trigger an auto load.
             */
            autoLoadPollingDelay: 100,

            /**
             * @cfg {Array}
             * An array of field names that each card will show for this column
             */
            fields: [],

            /**
             * @cfg {Array}
             * An array of names of additional fetch fields for displaying more fields on a card
             */
            additionalFetchFields: [],

            /**
             * @cfg {Rally.env.Context} context
             * Current application context object (user, workspace, project, scoping, etc.)
             */
            context: undefined,

            /**
             * Deprecated, use 'model' (singular) config instead.
             *
             * @cfg {Array}
             * @deprecated
             */
            models: [],

            /**
             * @cfg {Boolean}
             * @private
             * Flag to specify whether this column needs to generate different filters for different types.
             * Should be set to false if the filters returned from Rally.ui.cardboard.Column#getStoreFilter
             * are applicable to all types being displayed.
             */
            requiresModelSpecificFilters: true
        },

        /**
         * @constructor
         * @param {Object} config
         */
        constructor: function(config) {
            this.mergeConfig(config);

            if (Ext.isEmpty(this.model) && !Ext.isEmpty(this.models)) {
                // support deprecated this.models config option
                this.model = this.models;
            }

            this.plugins = this.plugins || [];
            this.initConfig(config);

            if (this.enableWipLimit) {
                this.plugins.push({
                    ptype: 'rallycolumnwipcontent',
                    wipLimit: this.wipLimit
                });
            }

            this.plugins.push('rallycardboardcardrecordprocessor');

            this._initDropController();

            this.callParent([this.config]);
        },

        initComponent: function() {
            this.addEvents(
                /**
                 * @event
                 * Fires when a card is picked up from this column.
                 * @param {Rally.ui.cardboard.Card} card The picked up card.
                 */
                'cardpickedup',
                /**
                 * @event
                 * Fires before a card that has been dropped has updated its data to Rally.
                 * @param {Rally.ui.cardboard.Column} this
                 * @param {Rally.ui.cardboard.Card} card The card that will be dropped
                 * @param {String} type The type of drop that was done.  Either 'reorder' or 'move'.
                 * @param {Rally.ui.cardboard.Column} sourceColumn The column that the card was dragged from
                 */
                'beforecarddroppedsave',

                /**
                 * @event
                 * Fires after a card that has been dropped has updated its data to Rally.
                 * @param {Rally.ui.cardboard.Column} this
                 * @param {Rally.ui.cardboard.Card} card The card that will be dropped
                 * @param {String} type The type of drop that was done.  Either 'reorder' or 'move'.
                 * @param {Rally.ui.cardboard.Column} sourceColumn The column that the card was dragged from
                 */
                'aftercarddroppedsave',

                /**
                 * @event
                 * Fires once the data is loaded
                 * @param {Rally.ui.cardboard.CardBoard} this
                 * @param {Rally.data.Model[]} records Records that will be used as backing objects for the cards
                 */
                'load',
                /**
                 * @event
                 * Fires when all the cards have been displayed
                 * @param {Rally.ui.cardboard.Column} this
                 */
                'ready',
                /**
                 * @event
                 * Fires when a column is filtered
                 * @param {Rally.ui.cardboard.Column} column The column that was filtered
                 */
                'filter',
                /**
                 * @event
                 * Fires when a card's record has been updated such that it no longer belongs in this column
                 * @param {Rally.ui.cardboard.Card} card The card which no longer belongs in this column
                 * @param {Rally.ui.cardboard.Column} column This column
                 */
                'cardinvalid',
                /**
                 * @event
                 * Fires when a card is added, refreshed or removed from this column
                 */
                'cardupdated',
                /**
                 * @event
                 * Fires when a card is ready
                 * @param {Rally.ui.cardboard.Card} the card that is now ready
                 */
                'cardready',
                /**
                 * @event
                 * Fires before a card is rendered
                 * @param {Rally.ui.cardboard.Card} card The card that is about to be rendered to this column
                 * @param {Rally.ui.cardboard.Column} column This column
                 */
                'beforecardrender'
            );
            this.callParent(arguments);

            this._cardsByRow = {};

            this._setLoading(true);
            this._queryForData();

            this.on('afterrender', this._addScrollListener, this);

            this.on('hide', function () {
                this.on('show', this.autoLoadCards, this, { single: true });
            }, this);
        },

        /**
         * Refreshes the column with the newConfig parameters
         * @param {Object} newConfig
         */
        refresh: function(newConfig) {
            this.clearCards();
            this.store = null;

            Rally.util.SafeExting.mergeOwnProperties(this, newConfig);

            this._queryForData();
        },

        /**
         * Load the Column's store after configuring store with filters and page size
         */
        loadStore: function() {
            this._setLoading(true);
            this._initStoreFilters();
            delete this._hasStoppedLoadingRecords;
            this.store.load();
        },

        getStore: function() {
            return this.store;
        },

        /**
         * Returns whether cards may be reranked when dragged within this column.
         * @return {Boolean} If reranking is allowed
         */
        mayRank: function() {
            var sorter = this.store.sorters.last();
            return Rally.data.Ranker.isRankField(sorter.property) &&
                sorter.direction === 'ASC' &&
                this.enableRanking;
        },

        _initDropController: function() {
            var dropControllerConfig = this.dropControllerConfig;
            if (dropControllerConfig) {
                var defaultConfig = {ptype: 'rallycolumndropcontroller'},
                    pluginConfig = Ext.isObject(dropControllerConfig) ? dropControllerConfig : defaultConfig;

                this.plugins = this.plugins || [];
                this.plugins.push(pluginConfig);
            }
        },

        _addScrollListener: function () {
            // DE20765: To disable browser auto scrolling to previous location on page load in Firefox,
            // set scrollTop to 0 on initial scroll
            if (Ext.isGecko) {
                this.on('scroll', function (event, element) {
                    this._scrollToTop(element);
                }, this, { single: true });
            }

            this.on('scroll', function () { this.autoLoadCards(); }, this);

            var scrollElement = this.getScrollElement();
            if (scrollElement) {
                this.mon(Ext.fly(scrollElement), 'scroll', this._onScroll, this);
            }

            this.mon(Ext.fly(window), 'scroll', this._onScroll, this);
        },

        _onScroll: function (event, element) {
            this.fireEvent('scroll', this, element);
        },

        _scrollToTop: function (domElement) {
            var scrollElement = this.getScrollElement();
            var scrollDom = scrollElement && scrollElement.dom;

            // DE20765: If the scroll event was not fired by the scroll element,
            // then scroll the window instead. Without this, Firefox will still remember the old window scroll location,
            // causing constant auto loads until the position is reached
            if (!scrollDom || scrollDom !== domElement) {
                scrollElement = window;
            }

            scrollElement.scrollTo('top', 0);
        },

        autoLoadCards: function () {
            if (this._waitForAutoLoad) {
                this._queueAutoLoad = true;
                return;
            }

            if (!this.isLoading() && this._shouldAutoLoadMoreRecords()) {
                this.loadMoreRecords();
            }

            this._waitForAutoLoad = true;

            Ext.defer(function () {
                delete this._waitForAutoLoad;

                if (this._queueAutoLoad) {
                    delete this._queueAutoLoad;
                    this.autoLoadCards();
                }
            }, this.autoLoadPollingDelay, this);
        },

        /**
         * Returns all the fields that are needed to be fetched by the CardBoard
         * @returns {String[]} The fetch fields.
         */
        getAllFetchFields: function() {
            var requiredFetchFields = [this.attribute, 'ObjectID', 'Workspace'],
                cardClass = Ext.ClassManager.get(Ext.ClassManager.getNameByAlias('widget.' + this.cardConfig.xtype));

            if (this.isCardAgeEnabled()) {
                requiredFetchFields.push('VersionId');
                requiredFetchFields.push('RevisionHistory');
                requiredFetchFields.push('CreationDate');
            }

            var sorters = (this.store && this.store.sorters.getRange()) || (this.storeConfig && this.storeConfig.sorters) || [];
            if(Ext.isEmpty(sorters)) {
                sorters.push(this._getDefaultSorter());
            }

            var allFields = _.compact(_.union(
                requiredFetchFields,
                this.additionalFetchFields,
                cardClass.getFetchFields(),
                this.fields,
                this.storeConfig.fetch || [],
                _.pluck(sorters, 'property')
            ));

            return Rally.ui.cardboard.CardFieldFetch.getFetchFields(allFields, this.storeConfig.useShallowFetch);
        },

        isCardAgeEnabled: function() {
            return this.cardConfig.showAge > -1;
        },

        show: function() {
            if(this.getColumnHeaderCell()) {
                this.getColumnHeaderCell().removeCls(this.self.HIDDEN_CLS);
            }
            _.invoke(this.getContentCellContainers(), 'removeCls', this.self.HIDDEN_CLS);
            this.callParent(arguments);
        },

        hide: function() {
            this.callParent(arguments);
            if(this.getColumnHeaderCell()) {
                this.getColumnHeaderCell().addCls(this.self.HIDDEN_CLS);
            }
            _.invoke(this.getContentCellContainers(), 'addCls', this.self.HIDDEN_CLS);
        },

        /**
         * Returns a filter config to be applied to the column's store.
         *
         * This function will be called for each model being displayed during column initialization.
         *
         * @template
         * @param {Rally.data.wsapi.Model} model The model the filter will be applied.
         * @return {Object|Object[]} the filter config to be applied
         */
        getStoreFilter: function(model) {
            return {
                property: this.attribute,
                operator: '=',
                value: this.getValue()
            };
        },

        _getModelScopedFilters: function(models) {
            if(!this.requiresModelSpecificFilters) {
                return [this.getStoreFilter()];
            } else {
                var filters = _.map(models, function (model) {
                    // filter by typeDefOid so we only get back the models we asked for
                    var filter = Ext.create('Rally.data.wsapi.Filter', {
                        property: 'TypeDefOid',
                        value: model.typeDefOid,
                        operator: '='
                    });

                    // AND all model specific filters together with typeDefOid filter to scope by model type
                    var modelFilters = this.getStoreFilter(model);
                    if (!Ext.isEmpty(modelFilters)) {
                        filter = _.reduce(Ext.Array.from(modelFilters), function (result, modelFilter) {
                            return result.and(modelFilter);
                        }, filter);
                    }

                    return filter;
                }, this);

                // OR model filters together so we get back all models we asked for
                return _.reduce(filters, function (result, filter) {
                    return Ext.isEmpty(result) ? filter : result.or(filter);
                }, null, this);
            }
        },

        _initStoreFilters: function() {
            var filters = this._mergeConfigFilters(this._getFiltersForModels());
            if (this.filterCollection) {
                this.filterCollection.addPermanentFilter(filters);
                filters = this.filterCollection.toArray();
            }

            this.store.setFilter(filters);
        },

        _getFiltersForModels: function() {
            return Ext.isEmpty(this.store.models) ? this.getStoreFilter(this.store.model) : this._getModelScopedFilters(this.store.models);
        },

        _mergeConfigFilters: function(filters) {
            filters = Ext.Array.from(filters);

            var configFilters = this.storeConfig.filters;

            if (!Ext.isEmpty(configFilters)) {
                filters = filters.concat(_.map(Ext.Array.from(configFilters), Ext.clone));
            }

            _.each(filters, function(f){
                if(f instanceof Rally.data.wsapi.Filter){
                    f.itemId = f.toString();
                } else if (Ext.isObject(f)){
                    f.itemId = Ext.create('Rally.data.wsapi.Filter', f).toString();
                }
            });

            return filters;
        },

        _queryForData: function() {
            return this.buildStore(this._getStoreConfig()).then({
                success: this._onStoreBuilt,
                scope: this
            });
        },

        _createAndAddCardsFromStore: function(store) {
            var records = [];
            store.each(function(record) {
                if (this.isMatchingRecord(record)) {
                    records.push(record);
                }
            }, this);

            this.createAndAddCards(records).then({
                success: function () {
                    this.fireEvent('load', this, records);
                    this._columnReady();
                },
                scope: this
            });
        },

        _onStoreBuilt: function(store) {
            this.store = store;

            this.store.on('load', this._onStoreLoad, this);

            if (store.getCount()) {
                // handle in-memory or pre-loaded stores
                this._createAndAddCardsFromStore(store);
            } else if (!this.storeConfig.hasOwnProperty('autoLoad') || this.storeConfig.autoLoad) {
                this.loadStore();
            }
        },

        _onStoreLoad: function(store, records, successful, options) {
            options = options || {};
            records = records || [];
            if (!this.rendered) {
                this.on('afterrender', Ext.bind(this._onStoreLoad, this, [store, records, successful, options]), {single: true});
                return;
            }

            var clearExistingCards = successful && store.clearOnPageLoad && !this._loadingMoreRecords;
            delete this._loadingMoreRecords;

            if (clearExistingCards) {
                this.clearCards();
            }

            if (records.length === 0) {
                this._hasStoppedLoadingRecords = true;
            }

            this.fireEvent('storeload', store, records, successful, options);

            if (successful) {
                records = _.filter(records, function(record) {
                    return this.isMatchingRecord(record) && (clearExistingCards || !this._isCardRendered(record));
                }, this);

                this.createAndAddCards(records).then({
                    success: function () {
                        if (this._shouldAutoLoadMoreRecords()) {
                            this.loadMoreRecords();
                        } else {
                            this.fireEvent('load', this, records);
                            this._columnReady();
                        }
                    },
                    failure: function () {
                        this._setLoading(false);
                    },
                    scope: this
                });

            } else {
                this._setLoading(false);
                this._onStoreLoadFailure();
            }
        },

        _isCardRendered: function(record) {
            return _.some(this.getCards(), function (card) {
                return card.record.getId() === record.getId();
            }, this);
        },

        _shouldAutoLoadMoreRecords: function() {
            if (this._hasMoreRecords() && this.isVisible()) {
                var cards = this.getCards();

                if (cards.length === 0) {
                    return true;
                }

                var thresholdCard = cards[cards.length - this.autoLoadCardThreshold] || cards[0];
                return thresholdCard.cardAboveBottomOfWindow();
            }

            return false;
        },

        getScrollElement: function () {
            return this.ownerCardboard && this.ownerCardboard.getScrollElement && this.ownerCardboard.getScrollElement();
        },

        isLoading: function () {
            return this._loading;
        },

        _setLoading: function (loading) {
            this._loading = loading;
        },

        /**
         * Load more records in a column. This assumes the store is a pageable store.
         */
        loadMoreRecords: function() {
            if (!this._hasMoreRecords()) {
                this._setLoading(false);
                return;
            }

            this._setLoading(true);
            this._loadingMoreRecords = true;

            this.store.nextPage({
                addRecords: true
            });
        },

        _onStoreLoadFailure: function() {
            Rally.ui.notify.Notifier.showError({
                message: 'There was a problem loading the data for column "' + this.value + '"'
            });

            this._columnReady();
        },

        _hasMoreRecords: function() {
            var totalCount = this.store.getTotalCount() || 0;
            return !this._hasStoppedLoadingRecords && totalCount > this.store.getCount();
        },

        _getBrowserTestCls: function() {
            return Rally.util.Test.toBrowserTestCssClass(this.getColumnHeader().getHeaderValue() || this.getValue());
        },

        _addBrowserTestCls: function() {
            _.invoke(this.getContentCells(), 'addCls', this._getBrowserTestCls());
            this.getColumnHeaderCell().addCls(this._getBrowserTestCls());
        },

        afterRender: function() {
            this.callParent(arguments);
            this.drawHeader();
            this._addBrowserTestCls();
        },

        _getInsertIndex: function(card) {
            var row = this.getRowFor(card),
                cards = this.getCardsInRow(row),
                records = _.invoke(cards, 'getRecord'),
                record = card.getRecord();
            records.push(record);
            this._sortRecords(records);
            return _.findIndex(records, function(r) {
                return record.getId() === r.getId();
            });
        },

        _sortRecords: function(records) {
            if (this.store.sorters.length) {
                records.sort(this.store.sorters.last().sort);
            }
        },

        _getStoreConfig: function() {
            var defaultPageSize = 15,
                sorters = !Ext.isEmpty(this.storeConfig.sorters) ?
                    this.storeConfig.sorters : [this._getDefaultSorter()];

            return {
                sorters: sorters,
                fetch: this.getAllFetchFields(),
                search: this.storeConfig.search,
                pageSize: this.storeConfig.pageSize || defaultPageSize,
                useShallowFetch: this.storeConfig.useShallowFetch
            };
        },

        _getDefaultSorter: function() {
            return {
                property: Rally.data.Ranker.RANK_FIELDS.MANUAL,
                direction: 'ASC'
            };
        },

        _getSortProperty: function() {
            if (this.store && this.store.sorters && this.store.sorters.getCount()) {
                return this.store.sorters.getAt(0).property;
            }

            return Rally.data.Ranker.RANK_FIELDS.MANUAL;
        },

        getColumnHeader: function() {
            return this.columnHeader;
        },

        getColumnHeaderCell: function() {
            return Ext.get(this.headerCell);
        },

        getHeaderTitle: function() {
            return this.getColumnHeader().down('#headerTitle');
        },

        onRowAdded: function(row) {
            this.fireEvent('rowadd', this, row);
            if(this.isHidden()) {
                this.hide();
                row.hideColumn(this);
            }
        },

        /**
         * Get the rows in this column
         * @returns {Rally.ui.cardboard.row.Row[]}
         */
        getRows: function() {
            return this.ownerCardboard.getRows();
        },

        /**
         * Get the row corresponding to the specified card
         * @param {Rally.ui.cardboard.Card} card
         * @returns {Rally.ui.cardboard.row.Row}
         */
        getRowFor: function(card) {
            return this.ownerCardboard.getRowFor(card);
        },

        getContentCells: function() {
            return _.invoke(this.getRows(), 'getContentCellFor', this);
        },

        getContentCellContainers: function() {
            return _.invoke(this.getContentCells(), 'parent');
        },

        drawHeader: function() {
            if (!this.getColumnHeader()) {

                var config = {
                    renderTo: this.getColumnHeaderCell()
                };

                config = Ext.merge({}, config, this.columnHeaderConfig);
                this.columnHeader = Ext.widget(config);
            }
        },

        /**
         * Remove all the cards from this column
         */
        clearCards: function() {
            this._cancelInProgressAsyncCardRendering();
            _.each(this.getCards(), function(card) {
                this.removeCard(card, true);
            }, this);
            this._cardsByRow = {};
        },

        _cancelInProgressAsyncCardRendering: function () {
            if (!_.isUndefined(this._processBatchOfCardsTimeoutId)) {
                clearTimeout(this._processBatchOfCardsTimeoutId);
                delete this._processBatchOfCardsTimeoutId;
            }
        },

        /**
         * Get all the cards in this column
         * @returns {Rally.ui.cardboard.Card[]} Returns all cards from this column.
         */
        getCards: function() {
            return _.reduce(this.getRows(), function(memo, row) {
                return memo.concat(this.getCardsInRow(row));
            }, [], this);
        },

        /**
         * Get all the cards in this column and the specified row
         * @param {Rally.ui.cardboard.row.Row} row
         * @returns {Rally.ui.cardboard.Card[]} Returns all cards from this column in the specified row
         */
        getCardsInRow: function(row) {
            var cardsInRow = this._cardsByRow[row.getRowValue()];
            return (cardsInRow && cardsInRow.getRange()) || [];
        },

        /**
         *
         * isMatchingRecords a record by its object id or its domNode or its ext element
         * @param {Rally.data.Model/String} searchCriteria An objectId, or record
         * @returns {Object} The returned object will be in this format. {index:9,record: {get:set:},card: {}}
         */
        findCardInfo: function(searchCriteria) {
            var foundCard = null;
            searchCriteria = searchCriteria.get ? searchCriteria.getId() : searchCriteria;

            _.forEach(this.getCards(), function(card) {
                if (card.getRecord().getId() === searchCriteria ||
                    card.getEl() === searchCriteria ||
                    card.getEl() === Ext.get(searchCriteria)) {
                    var row = this.getRowFor(card);
                    foundCard = {
                        record: card.getRecord(),
                        index: _.indexOf(this.getCardsInRow(row), card),
                        card: card,
                        row: row
                    };

                    return false;
                }
            }, this);

            return foundCard;
        },

        /**
         * Gets a card by its record
         * @param {Rally.data.Model} record A record that will be used to retrieve the matching card from this column.
         * @returns {Rally.ui.cardboard.Card} The requested card
         */
        getCard: function(record) {
            var result = this.findCardInfo(record);
            if (result) {
                return result.card;
            }
            return null;
        },


        /**
         * Gets records for this column
         * @param {String}type An optional param that can be used to restrict what Rally object type will be returned
         * @returns {Rally.data.Model[]} The records in this column that are contained in this column.
         */
        getRecords: function(type) {
            var records = [];
            Ext.each(this.getCards(), function(card) {
                var record = card.getRecord();
                if (Ext.isEmpty(type) || (record.get("_type") === type)) {
                    records.push(record);
                }
            });
            return records;
        },

        /**
         * Determines whether the specified record may be contained within this column
         * (If its value matches that of this column)
         *
         * @param {Rally.data.Model} record
         */
        isMatchingRecord: function(record) {
            var recordValue = record.get(this.attribute),
                field = record.getField(this.attribute),
                typePath = record.self.typePath,
                models = this.store.models || Ext.Array.from(this.store.model),
                supportedTypes = _.pluck(models, 'typePath');

            if (!field || !_.contains(supportedTypes, typePath)) {
                return false;
            }

            var columnValue = this.getValue();

            // Field values can be converted from null. So we need to convert the column
            // value in case it is null
            if (Ext.isFunction(field.convert)) {
                columnValue = field.convert(columnValue, record);
            }

            return (columnValue === recordValue ||
            (Rally.util.Ref.isRefUri(columnValue) &&
            Rally.util.Ref.getRelativeUri(recordValue) === Rally.util.Ref.getRelativeUri(columnValue)));
        },

        /**
         * Adds a card to this column.
         * @param {Rally.data.Model} record
         * @param {Number} index The zero based index where the card will be added.
         *  This parameter is deprecated, pass null to place the card in the correct position based on the current sort criteria.
         * @param {Boolean} highlight true to highlight card after it has been added.
         * @param {Object} cardConfig config to be used to create the card
         */
        createAndAddCard: function(record, index /* deprecated, pass null to auto place the card */, highlight, cardConfig) {
            var card;
            if (this.isMatchingRecord(record)) {
                this.recordProcessor.process([record]);
                card = this._createCard(record, cardConfig);
                this.addCard(card, index, highlight);
            }

            return card;
        },

        _createCard: function(record, cardConfig) {
            if (this.fields && this.fields.length > 0) {
                if (!Ext.isObject(cardConfig)) {
                    cardConfig = {};
                }
                cardConfig.fields = Ext.Array.union(this.cardConfig.fields || [], this.fields || []);
            }

            var config = Ext.merge({}, this.cardConfig, {
                record: record
            }, cardConfig);

            var card = Ext.widget(config.xtype, config);

            card.rankRecordHelper = {
                _addColumnFilters: function(storeConfig) {
                    var row = card.ownerColumn.getRowFor(card);
                    storeConfig.filters = Ext.Array.merge(
                        storeConfig.filters || [],
                        card.ownerColumn.store.filters.getRange());
                    if(card.ownerColumn.getRows().length > 1) {
                        storeConfig.filters.push({
                            property: row.fieldDef.name,
                            operator: '=',
                            value: row.getRowValue()
                        });
                    }
                },

                findRecordToRankAgainst: function(options) {
                    options = options || {};
                    var extremeLoadOptions = {
                        last: !options.highest,
                        metricsCmp: options.requester,
                        storeConfig: {}
                    };
                    this.rankRecordHelper._addColumnFilters(extremeLoadOptions.storeConfig);
                    return Rally.data.Ranker.loadExtremeRankedRecord(this.ownerColumn.store, extremeLoadOptions)
                        .then(function(record) {
                            Ext.callback(options.success, options.scope, [record]);
                            return record;
                        });
                },

                getMoveToPositionStore: function(options) {
                    options = options || {};

                    var store = this.ownerColumn.store;

                    Ext.merge(options, {
                        storeConfig: {
                            model: store.model,
                            context: store.context
                        }
                    });

                    this.rankRecordHelper._addColumnFilters(options.storeConfig);

                    return Deft.Promise.when(Ext.create(store.self, options.storeConfig));
                },

                scope: card
            };

            return card;
        },

        /**
         * @protected
         * Adds a card to this column.
         * @param {Rally.ui.cardboard.Card} card
         * @param {Number} index The zero based index where the card will be added.
         *  This parameter is deprecated, pass null to place the card in the correct position based on the current sort criteria.
         * @param {Boolean} highlight true to highlight card after it has been added.
         */
        addCard: function(card, index /* deprecated, pass null to auto place the card */, highlight) {
            var record = card.getRecord();
            this.assign(record);

            this._renderCard(card, index);

            if (highlight) {
                card.highlight();
            }

            this.fireEvent('addcard');
            card.fireEvent('ready', card);
            return card;
        },

        _getContentContainerForCard: function(card) {
            var row = this.getRowFor(card);
            return row.getContentCellFor(this);
        },

        _renderCard: function(card, index) {
            this.fireEvent('beforecardrender', card, this);

            if (card.rendered) {
                if (card.ownerColumn) {
                    card.ownerColumn.removeCard(card, false);
                }

                index = this._insertCardAtIndex(card, index);
                this._setCardOwnerColumn(card);
            } else {
                if (!Ext.isNumber(index)) {
                    index = this._getInsertIndex(card);
                }

                this._setCardOwnerColumn(card);
                card.render(this._getContentContainerForCard(card), index);
            }

            this._addCardToCollection(card, index);
            this._relayCardEvents(card);
            this.fireEvent('cardready', card, this);
        },

        _insertCardAtIndex: function(card, index) {
            var row = this.getRowFor(card),
                cards = this.getCardsInRow(row),
                cardEl = card.getEl(),
                containerEl = row.getContentCellFor(this);

            index = Ext.isNumber(index) ? index : (this._getInsertIndex(card) || 0);

            if (cards.length === 0) {
                containerEl.insertFirst(cardEl);
            } else if (index >= cards.length) {
                cardEl.appendTo(containerEl);
            } else {
                this._insertCardBeforeOther(card, cards[index]);
            }

            return index;
        },

        _insertCardBeforeOther: function(card, otherCard) {
            if (otherCard !== card) { // sometimes we try to render a card to a position where it already exists
                card.getEl().insertBefore(otherCard.getEl());
            }
        },

        _setCardOwnerColumn: function(card) {
            card.ownerColumn = this;
            card.on('destroy', function() {
                card.ownerColumn = null;
            }, this, {single: true});
        },

        _relayCardEvents: function(card) {
            if (card._columnRelays) {
                card._columnRelays.destroy();
            }
            card._columnRelays = this.relayEvents(card, ['select', 'deselect', 'datachanged', 'cardcopied']);
        },

        _addCardToCollection: function(card, index) {
            var key = this._getCardKey(card),
                row = this.getRowFor(card),
                cards = this._cardsByRow[row.getRowValue()];
            if(!cards) {
                cards = Ext.create('Ext.util.MixedCollection');
                this._cardsByRow[row.getRowValue()] = cards;
            }
            if (Ext.isNumber(index)) {
                cards.insert(index, key, card);
            } else {
                cards.add(key, card);
            }
            this.mon(card, 'destroy', function() {
                this._removeCardFromCollection(card);
            }, this, {single: true});
        },

        _removeCardFromCollection: function(card) {
            _.each(this._cardsByRow, function(cards) {
                return !cards.removeAtKey(this._getCardKey(card));
            }, this);
        },

        _getCardKey: function(card) {
            var key = card.record.getId();
            if (!key) {
                Ext.Error.raise('card.record.id not found');
            }
            return key;
        },

        /**
         * @protected
         * Assign a record to this column by setting the appropriate value on it
         * @param record
         */
        assign: function(record) {
            record.set(this.attribute, this.getValue());
        },

        /**
         * Removes a card from this column.
         * @param {Rally.ui.cardboard.Card/Rally.data.wsapi.Model/Object} card The card or record to be used to find this card.
         * Could also be an object which has a "card" property.
         */
        removeCard: function(card, destroy) {
            var foundCardInfo = card.card || this.findCardInfo(card.record || card);

            if (foundCardInfo) {
                if (destroy !== false) {
                    foundCardInfo.card.destroy();
                } else {
                    foundCardInfo.card.getEl().parent().dom.removeChild(foundCardInfo.card.getEl().dom);
                }
                this._removeCardFromCollection(foundCardInfo.card);
            }
            this.fireEvent('removecard');
            card.ownerColumn = null;
        },

        /**
         * Refreshes a card with an updated record.
         * @param {Rally.data.Model} record The record containing new data to update the card with.
         * @param {Object} [options]
         * @param {Boolean} [options.rerank=false] Pass true to indicate that the card has been reranked
         * @param {Function} options.callback Function to be called once the card is refreshed.
         * Will only be called if card is still valid for this board.
         * @param {Object} options.scope The scope (this reference) in which the callback function is executed.
         */
        refreshCard: function(record, options) {
            var deferred = new Deft.Deferred(),
                foundCard = record.card ? record : this.findCardInfo(record);

            options = options || {};

            if (foundCard) {
                // Yo dawg I heard you like ifs, so I put some ifs in your ifs
                var card = foundCard.card;

                return this.refreshRecord(record, function(records) {

                    if (records.length === 0) {
                        this.fireEvent('cardinvalid', this, card);
                    } else if (records.length === 1) {
                        var refreshedRecord = records[0];
                        card.setRecord(refreshedRecord);
                        this._rerenderCard(card);
                        if (options.rerank || !this._cardIsInCorrectRow(card)) {
                            this.addCard(card, null, true);
                        }

                        if(Rally.realtime.Realtime.isRealtimeMessage(record)
                            && _.contains(record.data._changedFields, this.ownerCardboard.attribute)
                            && record.data[this.valueField] !== this.value) {
                            this.ownerCardboard.refreshCard(record);
                        } else {
                            Ext.callback(options.callback, options.scope, [card]);
                            this.fireEvent('cardupdated', foundCard.card);
                        }
                        deferred.resolve(card);
                    }
                }, this);
            } else {
                deferred.resolve();
            }

            return deferred.promise;
        },

        /**
         * @private
         * Refresh all the other tasks in the same row/col
         * intersection as the specified record.  This is necessary for apps
         * like task board when reranking since the TaskIndex of all the other cards was
         * also just updated on the server and we need to know the new values to get the
         * cards to display in the correct place.
         * @param record the record which was originally re-ranked
         */
        refreshNeighboringTaskIndices: function(record) {
            var row = this.getRowFor(record),
                cards = this.getCardsInRow(row),
                store = this.store,
                refreshStoreConfig = {
                    model: store.model,
                    context: store.context,
                    filters: store.filters.getRange(),
                    sorters: store.sorters.getRange(),
                    limit: cards.length,
                    fetch: ['TaskIndex']
                };
            if(!row.isDefault) {
                refreshStoreConfig.filters.push({
                    property: row.fieldDef.name,
                    value: row.getRowValue()
                });
            }
            var refreshStore = Ext.create(store.self, refreshStoreConfig);
            return refreshStore.load().then({
                success: function () {
                    _.each(cards, function (card) {
                        var refreshedRecord = refreshStore.getById(card.getRecord().getId());
                        if(refreshedRecord.getId() !== record.getId()) {
                            card.getRecord().set('TaskIndex', refreshedRecord.get('TaskIndex'));
                            this.addCard(card, null, false);
                        }
                    }, this);
                },
                scope: this
            });
        },

        _cardIsInCorrectRow: function(card) {
            return card.getEl().parent().dom === this._getContentContainerForCard(card).dom;
        },

        /**
         * Refreshes the record so that it populates all the fields such that it can be used in this column.
         * @param {Rally.data.wsapi.Model} record The record to be refreshed
         * @param {Function} callback Called once the record is loaded.  @deprecated - use returned promise instead
         * @param {Rally.data.wsapi.Model[]} callback.records records returned by the load
         * @return {Deft.Promise(Rally.data.wsapi.Model} record returned by the load
         */
        refreshRecord: function(record, callback) {
            var deferred = Ext.create('Deft.promise.Deferred');
            var promise = deferred.promise;
            this.recordLoadBegin({ description: 'refreshing record' });
            this.store.reloadRecord(record, {
                requester: this,
                fetch: this.getAllFetchFields(),
                useShallowFetch: this.storeConfig.useShallowFetch
            }).then({
                success: function(refreshedRecord) {
                    refreshedRecord.join(this.store);
                    Ext.callback(callback, this, [[refreshedRecord]]);
                    deferred.resolve(refreshedRecord);
                },
                failure: function(operation) {
                    Ext.callback(callback, this, [[]]);
                    deferred.reject(operation);
                },
                scope: this
            });

            promise.always(function() {
                this.recordLoadEnd();
            }, this);

            return promise;
        },

        /**
         * Creates a card for each record passed in
         * @param {Rally.data.Model[]} records
         */
        createAndAddCards: function(records) {
            var deferred = new Deft.Deferred();

            if (this.recordProcessor) {
                this.recordProcessor.process(records);
            }

            if (this.isDestroyed) {
                deferred.resolve();
            } else {
                this._processBatchOfCards(records, 0, 1, function() {
                    deferred.resolve();
                }, this);
            }

            return deferred.promise;
        },

        _rerenderCard: function(card) {
            this.recordProcessor.process([card.getRecord()]).then(function(renderedRecords) {
                card.reRender();
            });
        },

        _processBatchOfCards: function(records, start, quantity, callback, scope) {
            Ext.suspendLayouts();

            var end = start + quantity;
            var cards = [];
            _.each(records.slice(start, end), function(record) {
                var card = this._createCard(record);
                this._renderCard(card);

                cards.push(card);
            }, this);

            Ext.resumeLayouts(true);

            _.each(cards, function(card) {
                card.fireEvent('ready', card);
            });

            if (end < records.length) {
                var delayInMilliseconds = 1;
                this._processBatchOfCardsTimeoutId = Ext.defer(this._processBatchOfCards, delayInMilliseconds, this, [records, end, quantity, callback, scope]);
            } else {
                delete this._processBatchOfCardsTimeoutId;
                Ext.callback(callback, scope);
            }
        },

        _columnReady: function() {
            if (!this.rendered) {
                this.on('afterrender', this._columnReady, this);
                return;
            }

            this._setLoading(false);
            this.fireEvent('ready', this);
        },

        onDestroy: function() {
            this.clearCards();

            if (this.store && this.store.un) {
                this.store.un('load', this._onStoreLoad, this);
            }

            var header = this.getColumnHeader();
            if (header) {
                header.destroy();
            }

            this.callParent(arguments);
        },

        getMinWidth: function () {
            return 170;
        }
    });
})();