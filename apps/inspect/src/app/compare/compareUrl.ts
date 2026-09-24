export const compareUrl = (a: string, b: string, sample?: string): string => {
  const params = new URLSearchParams({ a, b });
  if (sample !== undefined) params.set("sample", sample);
  return `/compare?${params.toString()}`;
};
