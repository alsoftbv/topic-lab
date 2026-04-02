import { type ComponentProps } from "react";

type EditableProps = Omit<ComponentProps<"span">, "spellCheck" | "suppressContentEditableWarning"> & {
  as?: "span" | "code";
};

export function Editable({ as: Tag = "span", onPaste, ...props }: EditableProps) {
  return (
    <Tag
      suppressContentEditableWarning
      spellCheck={false}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
        }
        onPaste?.(e);
      }}
      {...props}
    />
  );
}
