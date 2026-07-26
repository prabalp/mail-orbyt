/** Typography scale — matches the Material 3 spec given for this product. */
export const typography = {
  pageHeading: "font-['Roboto_Flex'] text-[32px] font-semibold leading-tight",
  sectionHeading: "font-['Roboto_Flex'] text-2xl font-semibold leading-snug",
  cardTitle: "font-['Roboto_Flex'] text-lg font-medium leading-snug",
  body: "font-['Roboto_Flex'] text-base font-normal leading-relaxed",
  secondary: "font-['Roboto_Flex'] text-sm font-normal leading-relaxed",
  label: "font-['Roboto_Flex'] text-sm font-medium leading-none",
} as const;

export type TypographyToken = keyof typeof typography;
