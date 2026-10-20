import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AppAuthProvider } from "./lib/auth";

/**
 * `networkMode: "always"` is the important one. The default, "online", pauses
 * a query whose fetch failed until the browser says it is back online, and a
 * paused query stays in its pending state for ever. That is what a reader saw
 * when the API answered 502: a page stuck on the word "Loading", with no way
 * to tell a slow server from a broken one. With "always" a failed call always
 * reaches its error state, so the page can say so and offer a retry.
 *
 * The retry rule matches: try again once or twice for a server or network
 * problem, which is usually temporary, and never for a 4xx, which will fail
 * the same way every time. A single call also gives up after
 * api.ts's API_TIMEOUT_MS, so nothing waits indefinitely.
 */
/**
 * Retries do not wait for the window to be focused. The query library pauses
 * a retry while the document is unfocused, and a paused query keeps its
 * pending state, so a page whose first call failed in a background tab shows
 * "Loading" until the reader comes back to it. That is the hang we are
 * trying to remove, and there is no cost to turning it off here because
 * `refetchOnWindowFocus` is already false: nothing in this app refetches on
 * focus, so the focus manager has no other job.
 */
focusManager.setFocused(true);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      networkMode: "always",
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
    mutations: { networkMode: "always" },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppAuthProvider>
        <App />
      </AppAuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
