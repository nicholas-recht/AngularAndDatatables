/*
 * avenger.datatables
 * created by Nicholas Recht on 5/26/2016
 * last updated: 10/12/2016
 */
(function () {

    angular.module('avenger.datatables', [])
    /*
     * avRowCompiler service
     * Handles the synchronization of compiling angular-bound rows for each datatable.
     * Instead of compiling the rows when they are added (which doesn't necessarily happen during a digest cycle),
     * multiple rows are queued up then compiled all together using the $timeout service. This guarentees they will
     * be compiled during a digest cycle. 
     */
    .service("avRowCompiler", function ($timeout, $compile) {

        var _intervalTime = 2; // ms
        var _interval = false; 

        var avRowCompiler = {
            addRow: function (row, scope) {
                row.style.visibility = "hidden"; // toggle visibility to get rid of the "flicker" effect you get otherwise
                this._rows.push({ row: row, scope: scope });

                // check if we already have another request to compile rows
                if (!_interval) {

                    _interval = true;
                    $timeout(function () {

                        // compile all rows that have been queued
                        var _rowSet = avRowCompiler._rows;
                        _rowSet.forEach(function (val) {
                            val.row.style.visibility = "visible"; 
                            $compile(angular.element(val.row))(val.scope);
                        });

                        // reset the array of rows
                        avRowCompiler._rows = [];
                        _interval = false;

                    }, _intervalTime, true);
                }
            },
            _rows: []
        };

        return avRowCompiler;
    })
    
    /*
     * av-datatable directive
     * Wrapper for a datatable that makes creating a datatable within the angular framework simpler. The directive will
     * listen for changes to the dataset and update the datatable accordingly. 
     *
     * Tables are defined using the av-datatable directive, followed by an ng-repeat expression.
     *   e.g. <table av-datatable="x in requests">
     *
     * All child rows that use angular templates will use the "x" defined above to refer to the specific
     * row's object. 
     *   e.g. <script type="text/ng-template" id="col-9.html">
     *            <a ng-click="unassignStation(otherParam, x)" style="cursor:pointer">Unassign</a>
     *        </script>
     *
     * The directive also makes 5 additional functions for altering the table available through the dt-instance object:
     *    addRow(row)
     *    updateRow(row)
     *    removeRow(row)
     *    expandRow(row)
     *    removeAll(rows) - as an array
     *    addAll(rows)    - as an array
     *                    * row refers to the object in the ng-repeat expression (such as "x")
     *
     * The directive uses all of the standard angular-datatable plugins (such as DTColumnBuilder and DTOptionBuilder)
     * with two addition option for the table:
     *   1) "childTemplate" -> takes a string as a parameter with the value of the id of an angular template to use for each child row
     *   2) "rowBinding" -> takes an array of { key, value } objects as parameters to add to each created row of the table
     *
     * It also inlcudes two additional options for each column definition:
     *   1) "angularBinding" -> takes a string as a parameter with the value of the id of an angular template to use for the column
     *   2) "style" -> takes a css string to apply to each <td> tag in the column. Can also be a function which takes the data for the column and returns a css string. 
     *
     *
     * ** Note when moving rows between avenger datatables:
     *      Internally, avenger-datatables uses the $$rowIndex property of each item in the collection to track changes. When moving rows directly between tables, this can
     *      cause problems if the $$rowIndex property is kept. Using the helper methods (addRow, removeRow, removeAll, addAll) will automatically take care of this problem,
     *      but when working directly with the datasets (e.g. using array.push, array.splice, etc.) it is recommended to either make copies of the items (e.g. using angular.copy)
     *      or to first delete the $$rowIndex property before doing the move. 
     *
     * New Features:
     *  1 - Column Filtering
     *  Avenger-datatables may include search options on each column for more advanced/more specific filtering than the standard search input.
     *
     *  To include the feature on a table, add the { columnFilters: true }, option to the datatable. 
     *  Then, on each column that will include a column filter, add the { "columnFilter", "type" } option to the column definition. 
     *
     *  There are currently 3 "type" values to choose from:
     *      1 - "text": creates an md-autocomplete form that is populated with the values of the column and does text-based filtering.
     *      2 - "date": creates an md-datepicker element that searches the given column for a date* value.
     *      3 - "dateRange": creates two md-datepicker elements that search for date* values between the given range. 
     *          *Note: columns that use a date filter must return a Date object. Using the "render" option, the column may return a custom format for display but
     *                 for filtering the return type must be a Date object. 
     *
     *  The values for each column filter can be both set and returned using two accessor functions included as part of the dtInstance object
     *      setFilterValue(col, val) - sets the value for the filter for the given column (by index)
     *      getFilterValue(col)      - returns the value for the filter for the given column (by index)
     *          *Note: When settings a filter value, the type of object should match the type used by the specific column filter.
     *              "text" type filters should be a string value
     *              "date" type filters should be a Date object
     *              "dateRange" type filters should be a { min: Date, max: Date } like object
     *
     *  ** This feature is only fully supported with "static" datasets. Dynamically adding rows to the table will not add to the auto-complete boxes due to performance
     *     costs. The filtering should still function correctly however. 
     */
    .directive("avDatatable", function ($compile, $parse, avRowCompiler) {
        return {
            restrict: 'A',
            scope: {
                dtOptions: '=',
                dtColumns: '=',
                dtColumnDefs: '=',
                avDatatable: '@',
                dtInstance: '=',
                pBinding: "@"
            },
            link: function ($scope, $element, $attrs, $controller) {
                // Find the resources from the comment <!-- ngRepeat: item in items --> displayed by angular in the DOM
                // This regexp is inspired by the one used in the "ngRepeat" directive
                var _match = $scope.avDatatable.match(/^\s*.+?\s+in\s+(\S*)\s*/m);

                if (!_match) {
                    throw new Error('Expected expression in form of "_item_ in _collection_[ track by _id_]" but got "{0}".', _expression);
                }
                var _ngRepeatAttr = _match[1];

                var _pScope = $scope.$parent;

                var _rptItem = _match[0].split("in")[0].trim();

                var _childMap = {};

                //get any parent avDatatable bindings
                var _bindings = [];
                var _bindingString = "";
                if ($scope.pBinding) {
                    _bindingString = $scope.pBinding + "|";
                    _bindings = $scope.pBinding.split("|");
                    for (var i = 0; i < _bindings.length; ++i) {
                        var m = _bindings[i].match(/^\s*.+?\s+in\s+(\S*)\s*/m);
                        if (m) {
                            var rptAttr = m[1];
                            var rptItem = m[0].split("in")[0].trim();

                            _bindings[i] = { rptAttr: rptAttr, rptItem: rptItem };
                        }
                    }
                }

                var _options;
                //add the necessary _options for instaniating the table
                if (!$scope.dtOptions)
                    _options = {};
                else
                    _options = angular.copy($scope.dtOptions);

                // each created row must have any <td> styles added and then compiled using $compile
                _options.createdRow = function (row, data, dataIndex) {
                    //add a custom row bindings
                    if (_options.rowBinding) {
                        for (var i = 0; i < _options.rowBinding.length; ++i) {
                            row.setAttribute(_options.rowBinding[i].key, _options.rowBinding[i].value);
                        }
                    }

                    row.setAttribute("av-datatable-row", data.$$rowIndex);
                    row.setAttribute("rpt-expression", $scope.avDatatable);

                    avRowCompiler.addRow(row, _pScope); 
                    //$compile(angular.element(row))(_pScope);
                }

                _options.columns = angular.copy($scope.dtColumns);
                _options.columnDefs = angular.copy($scope.dtColumnDefs);

                // add any individual cell stylings and angular bindings
                for (var i = 0; i < _options.columns.length; ++i) {
                    if (typeof _options.columns[i].style === "function") {
                        _options.columns[i].createdCell = function (cell, cellData, rowData, rowIndex, colIndex) {
                            cell.style.cssText = _options.columns[colIndex].style(cellData);

                            cell.setAttribute("av-datatable-column", "");
                        }
                    }
                    else if (_options.columns[i].style) {
                        _options.columns[i].createdCell = function (cell, cellData, rowData, rowIndex, colIndex) {
                            cell.style.cssText = _options.columns[colIndex].style;

                            cell.setAttribute("av-datatable-column", "");
                        }
                    }
                    else {
                        _options.columns[i].createdCell = function (cell, cellData, rowData, rowIndex, colIndex) {
                            cell.setAttribute("av-datatable-column", "");
                        }
                    }
                }

                // set any "" column data values to null
                for (var i = 0; i < _options.columns.length; ++i) {
                    if (_options.columns[i].mData === "")
                        _options.columns[i].mData = null;
                }

                // column watches
                function setFilterOptions(data) {
                    $scope.dtInstance.DataTable.settings()[0]._dateFilters = [];
                    $scope.dtInstance.DataTable.settings()[0]._dateRangeFilters = [];

                    for (var i = 0; i < _options.columns.length; ++i) {
                        if (_options.columns[i].columnFilter) {
                            // text input filters
                            if (_options.columns[i].columnFilter == "text") {
                                $scope.filterOptions[i] = [];

                                // get the rows in the current selection
                                var array = [];
                                $scope.dtInstance.DataTable.rows({ search: 'applied' }).data().each(function (value, index) {
                                    array.push(value);
                                });

                                // get the unique values from the rows
                                var map = {};
                                if (_options.columns[i].mRender) {

                                    for (var j = 0; j < array.length; ++j) {
                                        if (array[j])
                                            map[_options.columns[i].mRender(array[j][_options.columns[i].mData], "filter", array[j])] = true;
                                    }
                                } else {
                                    for (var j = 0; j < array.length; ++j) {
                                        if (array[j])
                                            map[array[j][_options.columns[i].mData]] = true;
                                    }
                                }

                                for (var prop in map) {
                                    if (map.hasOwnProperty(prop) && prop)
                                        $scope.filterOptions[i].push(prop);
                                }
                            } // date filters
                            else if (_options.columns[i].columnFilter == "date") {
                                $scope.dtInstance.DataTable.settings()[0]._dateFilters.push({ col: i, values: $scope.filterValue });
                            }
                            else if (_options.columns[i].columnFilter == "dateRange") {
                                $scope.dtInstance.DataTable.settings()[0]._dateRangeFilters.push({ col: i, values: $scope.filterValue });
                            }
                        }
                    }
                }

                // function for creating the datatable
                function initTable(newVal) {
                    _inQueue = false;
                    //get the data attribute
                    _options.data = newVal

                    //add an index to each item in data
                    for (var i = 0; i < newVal.length; ++i) {
                        newVal[i].$$rowIndex = i;
                    }

                    //add any templates - from option "angularBinding" in columns
                    if (_options.columns && _options.columns.constructor === Array) {
                        for (var i = 0; i < _options.columns.length; ++i) {
                            if (_options.columns[i].angularBinding) {
                                _options.columns[i].render = function (data, type, full, meta) {
                                    if (type == "display") {
                                        return getHTMLTemplate(_options.columns[meta.col].angularBinding);
                                        // **note: we do the bindings on each cell individually so that the cell is not replaced as in the case where
                                        //         we do the entire row at once. We can't replace the cells because datatables keeps a cached copy
                                        //         which needs to be preserved.
                                    }
                                    else
                                        return data;
                                }
                            }
                        }
                    }
                    //3 conditions to check
                    //  1 - the table was previously initialized but both the <table> and the source have changed
                    if ($scope.dtInstance && $scope.dtInstance.DataTable && !document.contains($scope.dtInstance.dataTable[0])) {
                        $scope.dtInstance.DataTable.destroy();
                        $scope.dtInstance.dataTable.remove();

                        // now we need to do option #3 again
                        delete $scope.dtInstance;
                    }
                    //  2 - the table has previously been initialized and just the data source has changed
                    if ($scope.dtInstance && $scope.dtInstance.DataTable) {
                        $scope.dtInstance.DataTable
                            .clear()
                            .rows.add(newVal)
                            .draw();

                        //  3 - the table has never been initialized
                    } else {
                        //set the datatable instance
                        var DT = $element.DataTable(_options);
                        var dt = $element.dataTable();

                        $scope.dtInstance = {
                            id: $element.attr('id'),
                            DataTable: DT,
                            dataTable: dt
                        };

                        function visibilityChange() {
                            // get all the rows of the table
                            var rows = $scope.dtInstance.DataTable.rows();

                            // loop through each row
                            rows.every(function (index) {
                                var data = this.data();
                                var node = this.node();
                                // if the tr has been created for the row
                                if (node) {
                                    // then find all uncompiled nodes for the row and compile them
                                    angular.element(node).find("td[av-datatable-column]").each(function () {
                                        data.$$compileTD(this);
                                    });
                                }
                            })
                        }

                        // watch for column vis changes so we can compile any cells that haven't been yet
                        $element.on('column-visibility.dt', function (event, settings, column, state) {
                            if (state)
                                visibilityChange();
                        });

                        // add the column filter row and columns
                        if (_options.columnFilters) {
                            function appendColumns() {
                                for (var i = 0; i < _options.columns.length; ++i) {
                                    if ($scope.dtInstance.DataTable.column(i).visible())
                                        _filterRow.append(_filterCols[i]);
                                }
                            }

                            $element.find("thead").append(_filterRow);
                            appendColumns();

                            // update the search headers based on the currently filtered rows
                            $scope.dtInstance.DataTable.on('search.dt', function () {
                                setFilterOptions();
                            });

                            // watch for visibility changes
                            $element.on('column-visibility.dt', function (event, settings, column, state) {
                                _filterRow.children().detach();
                                appendColumns();
                            });
                        }
                    }
                    //functions for manipulating the datatable
                    var expandRow = function (val) {
                        var row = $scope.dtInstance.DataTable.row(val.$$rowIndex);

                        if (row.child.isShown()) {
                            // This row is already open - close it
                            row.child.hide();
                            val.$$expanded = false;
                        }
                        else {
                            // Open this row
                            var contents = "<div av-datatable-row='" + val.$$rowIndex + "' rpt-expression='" + $scope.avDatatable + "' child='true'>" +
                                            getHTMLTemplate(_options.childTemplate) + "</div>";
                            row.child($compile(contents)(_pScope)).show();
                            val.$$expanded = true;
                        }
                    }
                    var addRow = function (row) {
                        row.$$rowIndex = undefined;
                        newVal.push(row);
                    }
                    var removeRow = function (val) {
                        var index = newVal.indexOf(val);
                        if (index !== -1) {
                            newVal.splice(index, 1);
                        }
                        delete val.$$rowIndex;
                    }
                    var updateRow = function (val) {
                        index = val.$$rowIndex;

                        // invalidate and redraw the row
                        $scope.dtInstance.DataTable.row(index).invalidate();

                        // recompile the <td> elements if necessary
                        if (val.$$invalidate) {
                            val.$$invalidate();
                        }
                    }
                    var removeAll = function (vals) {
                        /* Delete an entire array of rows from the datatable which aren't necessarily in order
                         * This is far more efficient than calling removeRow individually for each row. 
                         */
                        var set = {};
                        for (var i = 0; i < vals.length; ++i)
                            set[vals[i].$$rowIndex] = true;
                        for (var i = 0; i < newVal.length; ++i) {
                            if (set[newVal[i].$$rowIndex]) {
                                delete newVal[i].$$rowIndex;
                                newVal.splice(i--, 1);
                            }
                        }
                    }
                    var addAll = function (vals) {
                        vals.forEach(function (row) {
                            addRow(row);
                        });
                    }

                    // functions for settings the datatable filter values
                    var setFilterValue = function (col, val) {
                        if (_options.columns[col].columnFilter == "date" || _options.columns[col].columnFilter == "dateRange")
                            $scope.filterValue[col] = val;
                        else
                            $scope.filterSearchText[col] = val;
                    }
                    var getFilterValue = function (col) {
                        if (_options.columns[col].columnFilter == "date" || _options.columns[col].columnFilter == "dateRange")
                            return $scope.filterValue[col];
                        else
                            return $scope.filterSearchText[col];
                    }
                    // assign the functions
                    $scope.dtInstance.expandRow = expandRow;
                    $scope.dtInstance.updateRow = updateRow;
                    $scope.dtInstance.addRow = addRow;
                    $scope.dtInstance.removeRow = removeRow;
                    $scope.dtInstance.removeAll = removeAll;
                    $scope.dtInstance.addAll = addAll;
                    $scope.dtInstance.getFilterValue = getFilterValue;
                    $scope.dtInstance.setFilterValue = setFilterValue;
                }

                // save a new copy of the collection
                function copyCollection(collection) {
                    // save the old collection
                    $scope.copyCollection = [];
                    collection.forEach(function (item) { $scope.copyCollection.push(item); });
                }

                // column filtering options
                if (_options.columnFilters) {
                    // this is a global filtering option because datatables provides no other way to do custom filtering, 
                    //however it should only affect tables that use this plugin
                    $.fn.dataTable.ext.search.push(
                        // filter for date selection
                        function (settings, data, dataIndex) {
                            if (settings._dateFilters) {
                                for (var i = 0; i < settings._dateFilters.length; ++i) {
                                    filter = settings._dateFilters[i];

                                    var d = new Date(data[filter.col]);
                                    var compare = filter.values[filter.col];

                                    if (compare) {
                                        if (!d)
                                            return false;
                                        else
                                            return compare.getDate() == d.getDate() && compare.getMonth() == d.getMonth() && compare.getYear() == d.getYear();
                                    } else
                                        return true;
                                }

                                return true;
                            } else
                                return true;
                            // filter for date ranges
                        }, function (settings, data, dataIndex) {
                            if (settings._dateRangeFilters) {
                                for (var i = 0; i < settings._dateRangeFilters.length; ++i) {
                                    filter = settings._dateRangeFilters[i];

                                    var d = new Date(data[filter.col]);
                                    var min = filter.values[filter.col].min;
                                    var max = filter.values[filter.col].max;

                                    if (min && max) {
                                        if (!d)
                                            return false;
                                        else
                                            return min <= d && d <= max;
                                    } else
                                        return true;
                                }
                                return true;
                            } else
                                return true;
                        }
                    );

                    // functions for autocomplete
                    $scope.querySearch = function (query, set) {
                        var items = $parse(set)($scope);
                        var results = query ? items.filter(createFilterFor(query)) : items;

                        return results.slice(0, 100);
                    }
                    function createFilterFor(query) {
                        var lowercaseQuery = angular.lowercase(query);
                        return function filterFn(val) {
                            return (angular.lowercase(val).indexOf(lowercaseQuery) !== -1);
                        };
                    }

                    // function to create a simple text filter
                    function createTextFilter(col) {
                        var str = '<md-input-container class=\'datatable-filter\'><md-autocomplete \
                                md-no-cache="true" \
                                md-selected-item="filterValue[#]" \
                                md-search-text="filterSearchText[#]" \
                                md-items="item in querySearch(filterSearchText[#], \'filterOptions[#]\')" \
                                md-item-text="item" \
                                md-min-length="0"> \
                                   <md-item-template> \
                                       <span md-highlight-text="filterSearchText[#]" md-highlight-flags="^i">{{item}}</span> \
                                   </md-item-template> \
                           </md-autocomplete></md-input-container>'.replace(/#/g, col);

                        var el = $compile(str)($scope);
                        td.append(el);

                        // add the custom search function
                        _filterWatches[col] = $scope.$watch(function () { return $scope.filterSearchText[col]; }, function (newVal, oldVal) {
                            if ($scope.dtInstance && $scope.dtInstance.DataTable) {
                                $scope.dtInstance.DataTable.column(col).search(newVal).draw();
                            }
                        });
                        $scope.filterOptions[col] = [];
                    }
                    // function to create a date picker filter
                    function createDateFilter(col) {
                        var str = '<md-datepicker ng-model="filterValue[#]"></md-datepicker>'.replace(/#/g, col);

                        var el = $compile(str)($scope);
                        td.append(el);

                        // add the custom search function
                        _filterWatches[col] = $scope.$watch(function () { return $scope.filterValue[col]; }, function (newVal, oldVal) {
                            if ($scope.dtInstance && $scope.dtInstance.DataTable) {
                                $scope.dtInstance.DataTable.column(col).search("").draw();
                            }
                        });
                    }
                    // function to create a date range filter
                    function createDateRangeFilter(col) {
                        $scope.filterValue[col] = { min: null, max: null };
                        var str = '<md-datepicker ng-model="filterValue[#].min" md-placeholder=\'Min\'></md-datepicker> \
                                   <md-datepicker ng-model="filterValue[#].max" md-placeholder=\'Max\'></md-datepicker>'
                            .replace(/#/g, col);

                        var el = $compile(str)($scope);
                        td.append(el);

                        // add the custom search function
                        _filterWatches[col] = $scope.$watch(function () { return $scope.filterValue[col].min; }, function (newVal, oldVal) {
                            if ($scope.dtInstance && $scope.dtInstance.DataTable) {
                                $scope.dtInstance.DataTable.column(col).search("").draw();
                            }
                        });
                        _filterWatches[col] = $scope.$watch(function () { return $scope.filterValue[col].max; }, function (newVal, oldVal) {
                            if ($scope.dtInstance && $scope.dtInstance.DataTable) {
                                $scope.dtInstance.DataTable.column(col).search("").draw();
                            }
                        });
                    }

                    var _filterCols = [];
                    var _filterRow = angular.element(document.createElement("tr"));
                    var _filterWatches = [];

                    $scope.filterOptions = [];
                    $scope.filterValue = {};
                    $scope.filterSearchText = {};

                    for (var i = 0; i < _options.columns.length; ++i) {
                        var td = angular.element(document.createElement("td"));
                        if (_options.columns[i].columnFilter) {
                            if (_options.columns[i].columnFilter == "text")
                                createTextFilter(i);
                            else if (_options.columns[i].columnFilter == "date")
                                createDateFilter(i);
                            else if (_options.columns[i].columnFilter == "dateRange")
                                createDateRangeFilter(i);
                        }

                        _filterCols.push(td);
                    }
                }

                // watch for changes to the repeat expression
                var _removeWatcher = _pScope.$watch(_ngRepeatAttr, function (newVal, oldVal) {
                    if (newVal !== null && newVal !== undefined && newVal.constructor === Array) {
                        initTable(newVal);

                        $scope.oldCollection = newVal;
                        $scope.oldLength = newVal.length;
                    }
                }, false);

                // watch for changes to the collection
                var _removeWatcher2 = $scope.$watchCollection("oldCollection", function (newCollection) {
                    if (newCollection) {
                        var deletedRows = [];
                        var newRows = [];
                        var existingRows = [];
                        // separate existing rows from new rows
                        for (var i = 0; i < newCollection.length; ++i) {
                            if (newCollection[i].$$rowIndex === undefined)
                                newRows.push(newCollection[i]);
                            else
                                existingRows.push(newCollection[i]);
                        }
                        // separate deleted rows from existing rows
                        for (var iOld = 0, iNew = 0; iOld < $scope.oldLength; ++iOld) {
                            if (existingRows[iNew] === undefined || existingRows[iNew].$$rowIndex !== iOld)
                                deletedRows.push(iOld);
                            else
                                ++iNew;
                        }

                        // delete the rows
                        for (var i = 0; i < deletedRows.length; ++i) {
                            $scope.dtInstance.DataTable.row(deletedRows[i]).child.remove();
                        }
                        $scope.dtInstance.DataTable.rows(deletedRows).remove();

                        // set the new $$rowIndex values
                        for (var i = 0; i < newCollection.length; ++i)
                            newCollection[i].$$rowIndex = i;

                        // add the new rows
                        $scope.dtInstance.DataTable.rows.add(newRows);

                        // draw the table
                        $scope.dtInstance.DataTable
                            .draw();

                        $scope.oldLength = newCollection.length;
                    }
                });

                // wait for the element to be removed so we can clean up
                $element.on("remove", function () {
                    _removeWatcher();
                    _removeWatcher2();
                    if (_filterWatches) {
                        _filterWatches.forEach(function (watch) { if (watch) watch(); });
                    }
                    $scope.$destroy();
                });
                return;
            }
        };
        // get the given html template from the id value and return the contents as a string
        function getHTMLTemplate(id) {
            var el = document.getElementById(id).innerHTML;
            return el;
        }
    })

    .directive("avDatatableRow", function ($parse, $compile) {
        return {
            scope: true,
            priority: 10000,
            controller: function ($scope, $element, $attrs) {
                var index = parseInt($attrs.avDatatableRow);

                var _match = $attrs.rptExpression.match(/^\s*.+?\s+in\s+(\S*)\s*/m);

                if (!_match) {
                    throw new Error('Expected expression in form of "_item_ in _collection_[ track by _id_]" but got "{0}".', _expression);
                }
                var _ngRepeatAttr = _match[1];

                var _rptItem = _match[0].split("in")[0].trim();

                $scope[_rptItem] = $parse(_ngRepeatAttr)($scope)[index];

                // functions to attach to the row object
                //   ** we first check if this is a child row since we don't want it to add
                //      a function in that case
                if ($attrs.child === undefined) {
                    // function to call when the row has been invalidated and needs to be updated
                    $scope[_rptItem].$$invalidate = function () {
                        // recompile all of the attached <td> elements
                        var tds = $element.find("td");

                        tds.each(function (index) {
                            $compile(this)($scope);
                        });
                    }
                    // function to call when an individual td of the row needs to be compiled
                    $scope[_rptItem].$$compileTD = function (td) {
                        $compile(td)($scope);
                    }
                }

                $element.attr("av-datatable-row", null);
            }
        }
    })

    // directive for each column of the table - marks cells that haven't been compiled yet
    .directive("avDatatableColumn", function () {
        return {
            scope: false,
            priority: 10000,
            controller: function ($scope, $element, $attrs) {
                $element.attr("av-datatable-column", null);
                $element.attr("av-compiled", "");
            }
        }
    });
})();
