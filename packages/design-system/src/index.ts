export { cn } from "./cn";
export { typography, type TypographyToken } from "./tokens/typography";
// designSystemPreset is intentionally NOT re-exported here — it's imported
// via the "@mail-orbyt/design-system/tailwind-preset" subpath instead, so
// tailwind.config.ts (loaded via Next's jiti CJS loader, not webpack) never
// has to resolve this package's React/JSX component files.

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./components/Button";
export { IconButton, type IconButtonProps } from "./components/IconButton";
export { TextInput, type TextInputProps } from "./components/TextInput";
export { TextArea, type TextAreaProps } from "./components/TextArea";
export { Select, type SelectProps, type SelectOption } from "./components/Select";
export { Checkbox, type CheckboxProps } from "./components/Checkbox";
export { RadioGroup, type RadioGroupProps, type RadioOption } from "./components/RadioGroup";
export { Switch, type SwitchProps } from "./components/Switch";
export { Badge, type BadgeProps, type BadgeTone } from "./components/Badge";
export { Chip, type ChipProps } from "./components/Chip";
export { Card, type CardProps } from "./components/Card";
export { Dialog, type DialogProps } from "./components/Dialog";
export { Drawer, type DrawerProps } from "./components/Drawer";
export {
  DropdownMenu,
  type DropdownMenuProps,
  type DropdownMenuItem,
} from "./components/DropdownMenu";
export { Tooltip, type TooltipProps } from "./components/Tooltip";
export { Tabs, type TabsProps, type TabItem } from "./components/Tabs";
export { Table, type TableProps, type TableColumn } from "./components/Table";
export { Pagination, type PaginationProps } from "./components/Pagination";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState";
export { Skeleton, type SkeletonProps } from "./components/Skeleton";
export { ToastProvider, useToast, type ToastTone } from "./components/Toast";
export { Alert, type AlertProps, type AlertTone } from "./components/Alert";
export { Stepper, type StepperProps, type StepperStep } from "./components/Stepper";
export { DatePicker, type DatePickerProps } from "./components/DatePicker";
export { TimePicker, type TimePickerProps } from "./components/TimePicker";
export { PageHeader, type PageHeaderProps } from "./components/PageHeader";
export { MetricCard, type MetricCardProps } from "./components/MetricCard";
export {
  StatusIndicator,
  type StatusIndicatorProps,
  type StatusTone,
} from "./components/StatusIndicator";

export { NAV_ITEMS, type NavItem } from "./shell/navigation";
export { Sidebar, type SidebarProps, type LinkComponentProps } from "./shell/Sidebar";
export { MobileDrawer, type MobileDrawerProps } from "./shell/MobileDrawer";
export {
  OrgSwitcher,
  type OrgSwitcherProps,
  type OrgSwitcherOrganisation,
} from "./shell/OrgSwitcher";
export { UserMenu, type UserMenuProps } from "./shell/UserMenu";
export { Breadcrumbs, type BreadcrumbsProps, type BreadcrumbItem } from "./shell/Breadcrumbs";
export {
  NotificationArea,
  type NotificationAreaProps,
  type NotificationItem,
} from "./shell/NotificationArea";
export { AppShell, type AppShellProps } from "./shell/AppShell";
