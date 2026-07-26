import { DropdownMenu } from "../components/DropdownMenu";

export interface UserMenuProps {
  name: string;
  email: string;
  onProfile: () => void;
  onSignOut: () => void;
}

export function UserMenu({ name, email, onProfile, onSignOut }: UserMenuProps): React.ReactElement {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu
      align="end"
      trigger={
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-sm font-medium text-on-primary-container"
          aria-label={`Account menu for ${name}`}
        >
          {initials || "?"}
        </span>
      }
      items={[
        { key: "identity", label: `${name} (${email})`, onSelect: () => {}, disabled: true },
        { key: "profile", label: "Profile settings", onSelect: onProfile },
        { key: "signout", label: "Sign out", onSelect: onSignOut, destructive: true },
      ]}
    />
  );
}
