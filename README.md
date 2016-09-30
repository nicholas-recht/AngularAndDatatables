# AngularAndDatatables

## av-datatable directive
Wrapper for a datatable that makes creating a datatable within the angular framework simpler. The directive will listen for changes to the dataset and update the datatable accordingly. 

Tables are defined using the av-datatable directive, followed by an ng-repeat expression.
   e.g. <table av-datatable="x in requests">

All child rows that use angular templates will use the "x" defined above to refer to the specific row's object. 
  e.g. <script type="text/ng-template" id="col-9.html">
         <a ng-click="unassignStation(otherParam, x)" style="cursor:pointer">Unassign</a>
       </script>
       
The directive also makes 5 additional functions for altering the table available through the dt-instance object:
  - addRow(row)
  - updateRow(row)
  - removeRow(row)
  - expandRow(row)
  - removeAll(rows) - as an array
  - addAll(rows)    - as an array
  
  * row refers to the object in the ng-repeat expression (such as "x")

The directive uses all of the standard angular-datatable plugins (such as DTColumnBuilder and DTOptionBuilder) with two addition option for the table:
  1) "childTemplate" -> takes a string as a parameter with the value of the id of an angular template to use for each child row
  2) "rowBinding" -> takes an array of { key, value } objects as parameters to add to each created row of the table
It also inlcudes two additional options for each column definition:
  1) "angularBinding" -> takes a string as a parameter with the value of the id of an angular template to use for the column
  2) "style" -> takes a css string to apply to each <td> tag in the column. Can also be a function which takes the data for the column and returns a css string. 
  
  ** Note when moving rows between avenger datatables:
Internally, avenger-datatables uses the $$rowIndex property of each item in the collection to track changes. When moving rows directly between tables, this can cause problems if the $$rowIndex property is kept. Using the helper methods (addRow, removeRow, removeAll, addAll) will automatically take care of this problem, but when working directly with the datasets (e.g. using array.push, array.splice, etc.) it is recommended to either make copies of the items (e.g. using angular.copy) or to first delete the $$rowIndex property before doing the move. 

## New Features:
1 - Column Filtering
Avenger-datatables may include search options on each column for more advanced/more specific filtering than the standard search input. To include the feature on a table, add the { columnFilters: true }, option to the datatable. Then, on each column that will include a column filter, add the { "columnFilter", "type" } option to the column definition. 
   
There are currently 3 "type" values to choose from:
  1 - "text": creates an md-autocomplete form that is populated with the values of the column and does text-based filtering.
  2 - "date": creates an md-datepicker element that searches the given column for a date* value.
  3 - "dateRange": creates two md-datepicker elements that search for date* values between the given range. 
    *Note: columns that use a date filter must return a Date object. Using the "render" option, the column may return a custom format for display but for filtering the return type must be a Date object. 

The values for each column filter can be both set and returned using two accessor functions included as part of the dtInstance object:
  - setFilterValue(col, val) - sets the value for the filter for the given column (by index)
  - getFilterValue(col)      - returns the value for the filter for the given column (by index)
  *Note: When settings a filter value, the type of object should match the type used by the specific column filter.
     -- "text" type filters should be a string value
     -- "date" type filters should be a Date object
     -- "dateRange" type filters should be a { min: Date, max: Date } like object
     ** This feature is only fully supported with "static" datasets. Dynamically adding rows to the table will not add to the auto-complete boxes due to performance costs. The filtering should still function correctly however. 
