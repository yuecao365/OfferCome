export type ApplicationActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialApplicationActionState: ApplicationActionState = {
  status: "idle",
  message: "",
};
