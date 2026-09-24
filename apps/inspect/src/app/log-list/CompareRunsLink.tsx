import clsx from "clsx";
import { FC } from "react";
import { Link } from "react-router";

import { ApplicationIcons } from "../appearance/icons";

import styles from "./CompareRunsLink.module.css";

export const CompareRunsLink: FC = () => (
  <Link to="/compare" className={clsx("btn", "btn-tools", styles.link)}>
    <i className={clsx(ApplicationIcons.compare, styles.icon)} />
    Compare runs
  </Link>
);
