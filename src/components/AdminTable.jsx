import * as React from "react"
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, ChevronDown, MoreHorizontal, Trash2, Edit, UserPlus, ScanFace } from "lucide-react"

import { Button } from "./ui/button"
import { Checkbox } from "./ui/checkbox"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Input } from "./ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table"

export function AdminTable({ data, onRemoveAdmin, onEditAdmin }) {
    const [sorting, setSorting] = React.useState([])
    const [columnFilters, setColumnFilters] = React.useState([])
    const [columnVisibility, setColumnVisibility] = React.useState({})
    const [rowSelection, setRowSelection] = React.useState({})

    const columns = [
        {
            id: "select",
            header: ({ table }) => (
                <div className="text-center">
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                />
            ),
            enableSorting: false,
            enableHiding: false,
            size: 60,
        },
        {
            accessorKey: "photo",
            header: () => <div className="font-bold text-blue-900 text-center">Photo</div>,
            cell: ({ row }) => {
                const photo = row.getValue("photo");
                const firstName = row.getValue("firstName");
                const lastName = row.getValue("lastName");
                return (
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden border border-blue-200">
                        {photo ? (
                            <img src={photo} alt={`${firstName} ${lastName}`} className="h-full w-full object-cover" />
                        ) : (
                            <span className="font-bold text-blue-600 text-xs">
                                {firstName && lastName ? `${firstName[0]}${lastName[0]}` : 'AD'}
                            </span>
                        )}
                    </div>
                );
            },
            size: 80,
        },
        {
            accessorKey: "firstName",
            header: () => <div className="font-bold text-blue-900 text-center">Prénom</div>,
            cell: ({ row }) => <div className="font-medium">{row.getValue("firstName")}</div>,
            size: 150,
        },
        {
            accessorKey: "lastName",
            header: () => <div className="font-bold text-blue-900 text-center">Nom</div>,
            cell: ({ row }) => <div className="font-medium">{row.getValue("lastName")}</div>,
            size: 150,
        },
        {
            accessorKey: "username",
            header: () => <div className="font-bold text-blue-900 text-center">Nom d'utilisateur</div>,
            cell: ({ row }) => <div className="text-sm text-muted-foreground">{row.getValue("username")}</div>,
            size: 180,
        },
        {
            accessorKey: "status",
            header: () => <div className="font-bold text-blue-900 text-center">Statut</div>,
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                    <span className="text-sm text-muted-foreground">{row.getValue("status")}</span>
                </div>
            ),
            size: 120,
        },
        {
            accessorKey: "faceIdConfigured",
            header: () => <div className="font-bold text-blue-900 text-center">Face ID</div>,
            cell: ({ row }) => {
                const isConfigured = row.getValue("faceIdConfigured");
                return (
                    <div className="flex justify-center">
                        {isConfigured ? (
                            <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-200 shadow-sm">
                                <ScanFace className="h-3.5 w-3.5" />
                                <span>Activé</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 text-red-500 bg-red-50 px-2.5 py-1 rounded-full text-xs font-medium border border-red-200 opacity-80">
                                <ScanFace className="h-3.5 w-3.5" />
                                <span>Désactivé</span>
                            </div>
                        )}
                    </div>
                );
            },
            size: 130,
        },
        {
            id: "actions",
            header: () => <div className="font-bold text-blue-900 text-center">Actions</div>,
            enableHiding: false,
            enableResizing: false,
            cell: ({ row }) => {
                const admin = row.original

                return (
                    <div className="flex items-center justify-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-blue-700 hover:bg-blue-100 hover:text-blue-900 font-medium transition-all"
                            onClick={() => onEditAdmin(admin)}
                        >
                            <Edit className="h-3.5 w-3.5 mr-1" />
                            Modifier
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 font-medium transition-all"
                            onClick={() => onRemoveAdmin(admin.id)}
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Supprimer
                        </Button>
                    </div>
                )
            },
            size: 140,
        },
    ]

    const table = useReactTable({
        data,
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
        },
    })

    return (
        <div className="w-full">
            <div className="flex items-center py-4 gap-4">
                <Input
                    placeholder="Filtrer par nom..."
                    value={(table.getColumn("name")?.getFilterValue() ?? "")}
                    onChange={(event) =>
                        table.getColumn("name")?.setFilterValue(event.target.value)
                    }
                    className="max-w-sm"
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="ml-auto">
                            Colonnes <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {table
                            .getAllColumns()
                            .filter((column) => column.getCanHide())
                            .map((column) => {
                                return (
                                    <DropdownMenuCheckboxItem
                                        key={column.id}
                                        className="capitalize"
                                        checked={column.getIsVisible()}
                                        onCheckedChange={(value) =>
                                            column.toggleVisibility(!!value)
                                        }
                                    >
                                        {column.id === 'name' ? 'Nom' : column.id === 'address' ? 'Adresse' : column.id}
                                    </DropdownMenuCheckboxItem>
                                )
                            })}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="rounded-lg border-2 border-[#1e3a8a] bg-white shadow-md overflow-x-auto">
                {/* Ligne bleue décorative */}
                <div className="h-1 bg-gradient-to-r from-[#1e3a8a] via-blue-500 to-[#1e3a8a] min-w-[800px]"></div>
                <Table className="min-w-[800px]">
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row, index) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className={index % 2 === 0 ? "bg-white" : "bg-blue-50/30"}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    Aucun résultat.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">
                <div className="text-muted-foreground flex-1 text-sm">
                    {table.getFilteredSelectedRowModel().rows.length} sur{" "}
                    {table.getFilteredRowModel().rows.length} ligne(s) sélectionnée(s).
                </div>
                <div className="space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Précédent
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Suivant
                    </Button>
                </div>
            </div>
        </div >
    )
}
