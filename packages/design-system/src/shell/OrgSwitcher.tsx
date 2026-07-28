import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "../components/DropdownMenu";

export interface OrgSwitcherOrganisation {
  id: string;
  name: string;
}

export interface OrgSwitcherProps {
  organisations: OrgSwitcherOrganisation[];
  activeOrganisationId: string;
  onSwitch: (organisationId: string) => void;
  onCreateOrganisation?: (() => void) | undefined;
}

export function OrgSwitcher({
  organisations,
  activeOrganisationId,
  onSwitch,
  onCreateOrganisation,
}: OrgSwitcherProps): React.ReactElement {
  const active = organisations.find((org) => org.id === activeOrganisationId);

  return (
    <DropdownMenu
      trigger={
        <span className="flex items-center gap-2 rounded-md-md px-3 py-2 text-sm font-medium text-on-surface hover:bg-on-surface/8">
          {active?.name ?? "Select organisation"}
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      }
      items={[
        ...organisations.map((org) => ({
          key: org.id,
          label: org.name,
          onSelect: () => onSwitch(org.id),
        })),
        ...(onCreateOrganisation
          ? [{ key: "__create__", label: "Create organisation…", onSelect: onCreateOrganisation }]
          : []),
      ]}
    />
  );
}
