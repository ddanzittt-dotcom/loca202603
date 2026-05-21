import { createElement } from "react"

export function BrandLogo({
  as: Tag = "strong",
  className = "",
  dotClassName = "",
  ...props
}) {
  return createElement(
    Tag,
    { ...props, className, "aria-label": props["aria-label"] || "loca." },
    "loca",
    createElement("span", { className: dotClassName, "aria-hidden": "true" }, "."),
  )
}
