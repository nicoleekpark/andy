import { defineConfig } from "vitest/config";

// Convex 함수 전용 러너. RN 컴포넌트 테스트는 jest-expo가 담당한다
// (convex/_generated/ai/guidelines.md: convex-test는 vitest + edge-runtime 필요).
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
