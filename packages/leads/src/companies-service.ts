import type { Company, Prisma, PrismaClient } from "@mail-orbyt/database";
import type { Pagination } from "@mail-orbyt/validation";

type CompaniesPrisma = Pick<PrismaClient, "company">;

export interface ListCompaniesParams extends Pagination {
  organisationId: string;
  search?: string;
}

export interface ListCompaniesResult {
  companies: Company[];
  totalCount: number;
}

export async function listCompanies(
  prisma: CompaniesPrisma,
  params: ListCompaniesParams,
): Promise<ListCompaniesResult> {
  const where: Prisma.CompanyWhereInput = {
    organisationId: params.organisationId,
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { domain: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [companies, totalCount] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.company.count({ where }),
  ]);

  return { companies, totalCount };
}

export async function getCompany(
  prisma: CompaniesPrisma,
  organisationId: string,
  companyId: string,
): Promise<Company | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.organisationId !== organisationId) return null;
  return company;
}
