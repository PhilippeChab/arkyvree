import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

export function useStartDemo(redirectTo: string = "/dashboard") {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [isPending, setIsPending] = useState(false);

  const start = async (overrideRedirect?: string) => {
    setIsPending(true);
    try {
      const response = await rpc.api.demo.start.$post();
      if (!response.ok) throw new Error("Failed to start demo");
      const user = await response.json();
      useAuthStore.setState({ user, isAuthenticated: true });
      navigate(overrideRedirect ?? redirectTo);
    } catch (err) {
      snackbar.error(err, "Failed to start demo");
    } finally {
      setIsPending(false);
    }
  };

  return { start, isPending };
}
