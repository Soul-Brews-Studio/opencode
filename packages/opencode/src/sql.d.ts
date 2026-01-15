// Type declarations for SQL file imports with { type: "text" }
declare module "*.sql" {
  const content: string
  export default content
}
