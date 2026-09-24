import { FC } from "react";
import { useNavigate } from "react-router";

import { ApplicationIcons } from "../appearance/icons";
import { NavbarButton } from "../navbar/NavbarButton";

export const CompareRunsButton: FC = () => {
  const navigateRouter = useNavigate();

  // NavigateFunction returns void | Promise<void>; Promise.resolve + .catch
  // handles the union without a no-floating-promises suppression.
  const navigate = (): void => {
    Promise.resolve(navigateRouter("/compare")).catch(() => {});
  };

  return (
    <NavbarButton
      label="Compare runs"
      icon={ApplicationIcons.compare}
      subtle
      onClick={navigate}
    />
  );
};
