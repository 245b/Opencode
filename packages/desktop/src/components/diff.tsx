import { type FileContents, FileDiff, type DiffLineAnnotation } from "@pierre/precision-diffs"

export interface DiffProps {
  before: FileContents
  after: FileContents
}

export function Diff(props: DiffProps) {
  let container!: HTMLDivElement

  console.log(props)

  interface ThreadMetadata {
    threadId: string
  }

  const lineAnnotations: DiffLineAnnotation<ThreadMetadata>[] = [
    {
      side: "additions",
      // The line number specified for an annotation is the visual line number
      // you see in the number column of a diff
      lineNumber: 16,
      metadata: { threadId: "68b329da9893e34099c7d8ad5cb9c940" },
    },
  ]

  const instance = new FileDiff<ThreadMetadata>({
    // You can provide a 'theme' prop that maps to any
    // built in shiki theme or you can register a custom
    // theme. We also include 2 custom themes
    //
    // 'pierre-night' and 'pierre-light
    //
    // For the rest of the  available shiki themes, check out:
    // https://shiki.style/themes
    theme: "none",
    // Or can also provide a 'themes' prop, which allows the code to adapt
    // to your OS light or dark theme
    // themes: { dark: 'pierre-night', light: 'pierre-light' },
    // When using the 'themes' prop, 'themeType' allows you to force 'dark'
    // or 'light' theme, or inherit from the OS ('system') theme.
    themeType: "system",
    // Disable the line numbers for your diffs, generally not recommended
    disableLineNumbers: false,
    // Whether code should 'wrap' with long lines or 'scroll'.
    overflow: "scroll",
    // Normally you shouldn't need this prop, but if you don't provide a
    // valid filename or your file doesn't have an extension you may want to
    // override the automatic detection. You can specify that language here:
    // https://shiki.style/languages
    // lang?: SupportedLanguages;
    // 'diffStyle' controls whether the diff is presented side by side or
    // in a unified (single column) view
    diffStyle: "split",
    // Line decorators to help highlight changes.
    // 'bars' (default):
    // Shows some red-ish or green-ish (theme dependent) bars on the left
    // edge of relevant lines
    //
    // 'classic':
    // shows '+' characters on additions and '-' characters on deletions
    //
    // 'none':
    // No special diff indicators are shown
    diffIndicators: "bars",
    // By default green-ish or red-ish background are shown on added and
    // deleted lines respectively. Disable that feature here
    disableBackground: false,
    // Diffs are split up into hunks, this setting customizes what to show
    // between each hunk.
    //
    // 'line-info' (default):
    // Shows a bar that tells you how many lines are collapsed. If you are
    // using the oldFile/newFile API then you can click those bars to
    // expand the content between them
    //
    // 'metadata':
    // Shows the content you'd see in a normal patch file, usually in some
    // format like '@@ -60,6 +60,22 @@'. You cannot use these to expand
    // hidden content
    //
    // 'simple':
    // Just a subtle bar separator between each hunk
    hunkSeparators: "line-info",
    // On lines that have both additions and deletions, we can run a
    // separate diff check to mark parts of the lines that change.
    // 'none':
    // Do not show these secondary highlights
    //
    // 'char':
    // Show changes at a per character granularity
    //
    // 'word':
    // Show changes but rounded up to word boundaries
    //
    // 'word-alt' (default):
    // Similar to 'word', however we attempt to minimize single character
    // gaps between highlighted changes
    lineDiffType: "word-alt",
    // If lines exceed these character lengths then we won't perform the
    // line lineDiffType check
    maxLineDiffLength: 1000,
    // If any line in the diff exceeds this value then we won't attempt to
    // syntax highlight the diff
    maxLineLengthForHighlighting: 1000,
    // Enabling this property will hide the file header with file name and
    // diff stats.
    disableFileHeader: false,
    // You can optionally pass a render function for rendering out line
    // annotations.  Just return the dom node to render
    renderAnnotation(annotation: DiffLineAnnotation<ThreadMetadata>): HTMLElement {
      // Despite the diff itself being rendered in the shadow dom,
      // annotations are inserted via the web components 'slots' api and you
      // can use all your normal normal css and styling for them
      const element = document.createElement("div")
      element.innerText = annotation.metadata.threadId
      return element
    },
  })

  // If you ever want to update the options for an instance, simple call
  // 'setOptions' with the new options. Bear in mind, this does NOT merge
  // existing properties, it's a full replace
  instance.setOptions({
    ...instance.options,
    theme: "pierre-dark",
    themes: undefined,
  })

  // When ready to render, simply call .render with old/new file, optional
  // annotations and a container element to hold the diff
  instance.render({
    oldFile: props.before,
    newFile: props.after,
    lineAnnotations,
    containerWrapper: container,
  })

  return <div ref={container} />
}
