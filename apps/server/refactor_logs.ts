const files = [
  "src/domains/product/service.ts",
  "src/domains/payment/service.ts",
  "src/domains/user/service.ts"
];

for (const file of files) {
  let content = Deno.readTextFileSync(file);
  
  // Replace: Effect.sync(() => log.info("...", { ... }))
  // With: Effect.logInfo("...").pipe(Effect.annotateLogs({ ... }))
  content = content.replace(/Effect\.sync\(\(\)\s*=>\s*log\.(info|warn|error)\((["'].*?["']),\s*(\{[\s\S]*?\})\)\)/g, (match, level, msg, obj) => {
    const effectLevel = level === 'info' ? 'Info' : level === 'warn' ? 'Warning' : 'Error';
    return `Effect.log${effectLevel}(${msg}).pipe(Effect.annotateLogs(${obj}))`;
  });
  
  // Also replace: log.error("...", { ... }) (without Effect.sync)
  content = content.replace(/log\.error\((["'].*?["']),\s*(\{[\s\S]*?\})\)/g, (match, msg, obj) => {
    return `Effect.logError(${msg}).pipe(Effect.annotateLogs(${obj}))`;
  });

  Deno.writeTextFileSync(file, content);
}
