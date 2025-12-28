import React, { useMemo } from "react";

import { Box } from "@mui/material";
import {
  DataGrid,
  GridToolbar,
  type DataGridProps,
  type GridColDef,
  type GridValidRowModel,
} from "@mui/x-data-grid";

type Props<Row extends GridValidRowModel> = {
  rows: Row[];
  columns: Array<GridColDef<Row>>;
  loading?: boolean;
  height?: number;
  getRowId?: DataGridProps<Row>["getRowId"];
  onRowClick?: DataGridProps<Row>["onRowClick"];
  initialPageSize?: number;
  disableToolbar?: boolean;
};

export function DataTable<Row extends GridValidRowModel>(props: Props<Row>) {
  const pageSizeOptions = useMemo(() => [10, 25, 50, 100], []);
  const initialState = useMemo(() => {
    return {
      pagination: {
        paginationModel: {
          page: 0,
          pageSize: props.initialPageSize || 25,
        },
      },
    };
  }, [props.initialPageSize]);

  return (
    <Box sx={{ width: "100%", height: props.height ?? 520 }}>
      <DataGrid
        rows={props.rows}
        columns={props.columns}
        loading={Boolean(props.loading)}
        getRowId={props.getRowId}
        onRowClick={props.onRowClick}
        disableRowSelectionOnClick
        pageSizeOptions={pageSizeOptions}
        initialState={initialState as any}
        slots={props.disableToolbar ? undefined : ({ toolbar: GridToolbar } as any)}
        slotProps={
          props.disableToolbar
            ? undefined
            : ({
                toolbar: {
                  showQuickFilter: true,
                  quickFilterProps: { debounceMs: 200 },
                },
              } as any)
        }
        sx={{
          borderRadius: 3,
          "& .MuiDataGrid-columnHeaders": {
            borderBottom: "1px solid",
            borderColor: "divider",
          },
          "& .MuiDataGrid-row:hover": {
            cursor: props.onRowClick ? "pointer" : "default",
          },
        }}
      />
    </Box>
  );
}

