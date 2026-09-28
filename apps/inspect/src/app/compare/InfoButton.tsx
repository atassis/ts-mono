import { FC, ReactNode, useState } from "react";

import { PopOver } from "@tsmono/react/components";

import { ApplicationIcons } from "../appearance/icons";

import styles from "./InfoButton.module.css";

interface InfoButtonProps {
  id: string;
  label: string;
  children: ReactNode;
}

/** An (i) button that opens a small explanatory popover. */
export const InfoButton: FC<InfoButtonProps> = ({ id, label, children }) => {
  const [open, setOpen] = useState(false);
  const [buttonEl, setButtonEl] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={setButtonEl}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={styles.button}
        onClick={() => setOpen((v) => !v)}
      >
        <i className={ApplicationIcons.info} />
      </button>
      <PopOver
        id={id}
        isOpen={open}
        setIsOpen={setOpen}
        positionEl={buttonEl}
        placement="bottom-start"
        hoverDelay={0}
      >
        {children}
      </PopOver>
    </>
  );
};
