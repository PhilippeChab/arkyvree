import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

export function useStartDemo(redirectTo: string = "/dashboard") {
  const navigate = useNavigate();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.demo.start.$post()),
    onSuccess: (user) => {
      useAuthStore.setState({ user, isAuthenticated: true });
      navigate(redirectTo);
    },
    onError: (error) => snackbar.error(error, "Failed to start demo"),
  });

  return { start: () => mutation.mutate(), isPending: mutation.isPending };
}
