import config from "@payload-config";
import { NotFoundPage } from "@payloadcms/next/views";

import { importMap } from "../importMap.js";

export default function NotFound() {
  return (
    <NotFoundPage
      config={config}
      importMap={importMap}
      params={Promise.resolve({ segments: [] })}
      searchParams={Promise.resolve({})}
    />
  );
}
