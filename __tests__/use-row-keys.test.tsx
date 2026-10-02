import { act, renderHook } from "@testing-library/react-native";
import { useRowKeys } from "@/lib/use-row-keys";

/**
 * src/lib/use-row-keys.ts — a key per row that stays with the row.
 *
 * The screens' own test (capture.test.tsx) proves the field survives a
 * removal. These pin the three ways a list's length changes, because the
 * profile and note editors rely on the two that need no call: adding at the
 * end, and the list being cut back from the end.
 */
describe("useRowKeys", () => {
  test("should keep every existing key when a row is added at the end", async () => {
    const { result, rerender } = await renderHook(
      ({ length }: { length: number }) => useRowKeys(length),
      { initialProps: { length: 2 } },
    );
    const [first, second] = result.current.keys;

    await rerender({ length: 3 });

    expect(result.current.keys).toHaveLength(3);
    expect(result.current.keys.slice(0, 2)).toEqual([first, second]);
    expect(new Set(result.current.keys).size).toBe(3);
  });

  test("should drop the removed row's key, not the last one, when a middle row goes", async () => {
    const { result, rerender } = await renderHook(
      ({ length }: { length: number }) => useRowKeys(length),
      { initialProps: { length: 3 } },
    );
    const [first, , third] = result.current.keys;

    await act(async () => {
      result.current.removeKey(1);
    });
    await rerender({ length: 2 });

    expect(result.current.keys).toEqual([first, third]);
  });

  test("should give a row added after a removal a key no other row has had", async () => {
    const { result, rerender } = await renderHook(
      ({ length }: { length: number }) => useRowKeys(length),
      { initialProps: { length: 2 } },
    );
    const before = [...result.current.keys];

    await act(async () => {
      result.current.removeKey(0);
    });
    await rerender({ length: 1 });
    await rerender({ length: 2 });

    expect(before).not.toContain(result.current.keys[1]);
  });
});
