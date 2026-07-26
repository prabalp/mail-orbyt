"use client";

import { createContext, useContext } from "react";

export interface OrganisationContextValue {
  organisationId: string;
  organisationName: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

const OrganisationContext = createContext<OrganisationContextValue | null>(null);

export function OrganisationProvider({
  value,
  children,
}: {
  value: OrganisationContextValue;
  children: React.ReactNode;
}): React.ReactElement {
  return <OrganisationContext.Provider value={value}>{children}</OrganisationContext.Provider>;
}

export function useOrganisation(): OrganisationContextValue {
  const context = useContext(OrganisationContext);
  if (!context) throw new Error("useOrganisation must be used within an OrganisationProvider");
  return context;
}
