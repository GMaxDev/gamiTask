// Resolves the `@shared/*` alias (see vite.config.ts and tsconfig paths) for `node --test`.
import {registerHooks} from 'node:module';
const root=new URL('../../server/src/',import.meta.url).href;
registerHooks({resolve(spec,ctx,next){return next(spec.startsWith('@shared/')?root+spec.slice(8)+'.ts':spec,ctx);}});
