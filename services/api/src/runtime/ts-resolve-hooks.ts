// Node resolve hook: workspace packages (e.g. @fretflow/score-model) use
// extensionless relative imports, which work in Vite/Vitest but not in Node's
// ESM resolver. Retry such specifiers with `.ts`. Our own code uses explicit
// `.ts` extensions and never needs this.

type Resolved = { url: string; format?: string | null; shortCircuit?: boolean };
type NextResolve = (specifier: string, context: unknown) => Promise<Resolved>;

export async function resolve(specifier: string, context: unknown, nextResolve: NextResolve): Promise<Resolved> {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    if (relative && !hasExtension && (err as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
