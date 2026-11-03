import {Fragment, type ReactNode} from 'react'

/**
 * A translated text with elements inside it: a call like rich(text, {file: <b>x</b>}) with the text "Open {file}".
 * Each `{name}` of the text is replaced by the element of that name (a name with no element stays as written), so a language
 * can put the elements wherever its sentence needs them.
 */
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    return <Fragment key={i}>{m && m[1] in nodes ? nodes[m[1]] : part}</Fragment>
  })
}
