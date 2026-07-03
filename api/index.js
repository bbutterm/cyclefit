// ЗАГЛУШКА: при сборке (pnpm build:vercel) этот файл перезаписывается
// esbuild-бандлом из apps/backend/src/vercel-entry.ts.
// Файл существует в репозитории, потому что Vercel проверяет паттерн
// `functions` из vercel.json ДО запуска buildCommand.
module.exports = (req, res) => {
  res.statusCode = 503;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('CycleFit API: сборка не заменила заглушку — проверь buildCommand (pnpm build:vercel)');
};
