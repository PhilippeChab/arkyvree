import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("frontend rules", () => {
  test("an icon button has an accessible name: an aria-label, or a Tooltip right around it", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.tsx": 'export const a = <IconButton aria-label="Delete" />;\n',
          "client/src/b.tsx": 'export const b = (\n  <Tooltip title="Delete">\n    <IconButton />\n  </Tooltip>\n);\n',
          "client/src/c.tsx": "export const c = <IconButton />;\n",
          "client/src/d.tsx":
            'export const d = (\n  <Tooltip title="Delete">\n    <span>\n      <IconButton disabled />\n    </span>\n  </Tooltip>\n);\n',
          "client/src/e.tsx":
            'export const e = (\n  <Tooltip title="Delete" describeChild>\n    <IconButton />\n  </Tooltip>\n);\n',
        },
        ["accessible-icon-buttons"],
      ),
    ).toEqual([
      "accessible-icon-buttons client/src/c.tsx",
      "accessible-icon-buttons client/src/d.tsx",
      "accessible-icon-buttons client/src/e.tsx",
    ]);
  });

  test("a dialog goes full screen on a phone, and a form is never in a Modal", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.tsx": "export const a = <Dialog open fullScreen={isMobile} />;\n",
          "client/src/b.tsx": "export const b = <Dialog open />;\n",
          "client/src/c.tsx": "export const c = (\n  <Modal>\n    <Box>\n      <form />\n    </Box>\n  </Modal>\n);\n",
          "client/src/d.tsx": 'export const d = (\n  <Modal>\n    <Box component="form" />\n  </Modal>\n);\n',
          "client/src/e.tsx": "export const e = (\n  <FormDialog>\n    <form />\n  </FormDialog>\n);\n",
          "client/src/f.tsx": 'export const f = (\n  <Modal>\n    <Box component={"form"} />\n  </Modal>\n);\n',
        },
        ["dialog-conventions"],
      ),
    ).toEqual([
      "dialog-conventions client/src/b.tsx",
      "dialog-conventions client/src/c.tsx",
      "dialog-conventions client/src/d.tsx",
      "dialog-conventions client/src/f.tsx",
    ]);
  });

  test("a query key starts from lib/queryKeys.ts", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.ts": "export const a = { queryKey: [...queryKeys.feats(id), search] };\n",
          "client/src/b.ts": "export const b = { queryKey: queryKeys.feats(id) };\n",
          "client/src/c.ts": 'export const c = { queryKey: ["feats", id] };\n',
          "client/src/lib/queryKeys.ts": 'export const k = { queryKey: ["feats"] };\n',
        },
        ["query-keys"],
      ),
    ).toEqual(["query-keys client/src/c.ts"]);
  });

  test("a mutation runs with mutate, and a loader is a DiceSpinner", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.ts": "export const a = () => save.mutate(values);\n",
          "client/src/b.ts": "export const b = () => save.mutateAsync(values);\n",
          "client/src/c.tsx":
            'import { Box, CircularProgress } from "@mui/material";\nexport const c = [Box, CircularProgress];\n',
          "client/src/d.ts":
            "export const d = () => {\n  const { mutateAsync } = useSave();\n  return mutateAsync;\n};\n",
          "client/src/e.tsx": 'import * as Mui from "@mui/material";\nexport const e = <Mui.CircularProgress />;\n',
        },
        ["client-apis"],
      ),
    ).toEqual([
      "client-apis client/src/b.ts",
      "client-apis client/src/c.tsx",
      "client-apis client/src/d.ts",
      "client-apis client/src/e.tsx",
    ]);
  });

  test("a form's field is bound through useController: never register, never a watched value", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bound.tsx": 'export const b = <NameField control={form.control} name="name" />;\n',
          "client/src/registered.tsx": 'export const r = <TextField {...form.register("name")} />;\n',
          "client/src/watched.tsx":
            'export const w = <Toggle value={form.watch("private")} onChange={(v) => form.setValue("private", v)} />;\n',
          "client/src/held.tsx":
            'const digits = watch("digits");\nexport const h = <CodeInput digits={digits} onChange={setDigits} />;\n',
          "client/src/shown.tsx": 'const name = watch("name");\nexport const s = <Typography>{name}</Typography>;\n',
        },
        ["controlled-inputs"],
      ),
    ).toEqual([
      "controlled-inputs client/src/held.tsx",
      "controlled-inputs client/src/registered.tsx",
      "controlled-inputs client/src/watched.tsx",
    ]);
  });

  test("a form's field reaches its input through inputRef, never spread whole with its ref", async () => {
    expect(
      await lintRepo(
        {
          "client/src/rendered.tsx":
            "export const r = <Controller render={({ field }) => <TextField {...field} select />} />;\n",
          "client/src/controlled.tsx":
            "export function C() {\n  const { field } = useController(options);\n  return <TextField {...field} />;\n}\n",
          "client/src/split.tsx":
            "export const s = <Controller render={({ field: { ref, ...field } }) => <TextField {...field} inputRef={ref} />} />;\n",
          "client/src/props.tsx":
            "export function P({ rows, ...field }: Props) {\n  return <FormTextField {...field} minRows={rows} />;\n}\n",
          "client/src/read.tsx":
            "export const d = <Controller render={({ field }) => <CodeInput digits={field.value} onChange={field.onChange} />} />;\n",
        },
        ["controlled-inputs"],
      ),
    ).toEqual(["controlled-inputs client/src/controlled.tsx", "controlled-inputs client/src/rendered.tsx"]);
  });

  test("a form is made with useFormWith, whose values are whole, never react-hook-form's useForm", async () => {
    expect(
      await lintRepo(
        {
          "client/src/hooks/useFormWith.ts":
            'import { useForm } from "react-hook-form";\nexport function useFormWith(values) {\n  return useForm({ defaultValues: values });\n}\n',
          "client/src/made.tsx":
            'import { useFormWith } from "@/client/src/hooks/index.ts";\nexport function Made() {\n  useFormWith({ name: "" });\n  return null;\n}\n',
          "client/src/partial.tsx":
            'import { useForm } from "react-hook-form";\nexport function Partial() {\n  useForm();\n  return null;\n}\n',
        },
        ["controlled-inputs"],
      ),
    ).toEqual(["controlled-inputs client/src/partial.tsx"]);
  });
  test("an effect never writes a form's field nor calls back its owner, but a handler it registers may", async () => {
    expect(
      await lintRepo(
        {
          "client/src/written.tsx":
            'export function W() {\n  useEffect(() => {\n    setValue("x", 1);\n  }, []);\n  return null;\n}\n',
          "client/src/renamed.tsx":
            'export function R({ wizard }) {\n  const { setValue: setPick } = wizard;\n  useEffect(() => {\n    setPick("x", 1);\n  }, [setPick]);\n  return null;\n}\n',
          "client/src/redirected.tsx":
            'export function D({ navigate }) {\n  useEffect(() => {\n    navigate("/x", { replace: true });\n  }, [navigate]);\n  return null;\n}\n',
          "client/src/called.tsx":
            "export function C({ onChange }) {\n  useEffect(() => {\n    onChange(1);\n  }, [onChange]);\n  return null;\n}\n",
          "client/src/subscribed.tsx":
            'export function S({ onMessage }) {\n  useEffect(() => socket.on("m", (m) => onMessage(m)), [onMessage]);\n  return null;\n}\n',
          "client/src/evented.tsx":
            'export function E({ onChange }) {\n  return <button onClick={() => { setValue("x", 1); onChange(1); }} />;\n}\n',
          "client/src/hooks/useFormSync.ts":
            "export function useFormSync(form) {\n  useEffect(() => {\n    form.reset({});\n  });\n}\n",
        },
        ["effect-writes"],
      ),
    ).toEqual([
      "effect-writes client/src/called.tsx",
      "effect-writes client/src/redirected.tsx",
      "effect-writes client/src/renamed.tsx",
      "effect-writes client/src/written.tsx",
    ]);
  });

  test("the API is called in a function a query or a mutation runs, named …Fn", async () => {
    expect(
      await lintRepo(
        {
          "client/src/direct.tsx": "export async function d() {\n  await rpc.api.feats.$get();\n}\n",
          "client/src/queried.tsx":
            "export const q = () => useQuery({ queryKey: k, queryFn: () => rpc.api.feats.$get() });\n",
          "client/src/handed.tsx":
            "export const h = <Picker pageFn={(s) => rpc.api.feats.$get({ query: { s } })} />;\n",
          "client/src/linked.tsx": "export const u = rpc.api.feats.$url();\n",
        },
        ["api-calls-in-queries"],
      ),
    ).toEqual(["api-calls-in-queries client/src/direct.tsx"]);
  });

  test("an error reaches the user one way per kind: an error Alert sits only in LoadError and the auth layout", async () => {
    expect(
      await lintRepo(
        {
          "client/src/written.tsx": 'export const w = <Alert severity="error">Failed to load feats.</Alert>;\n',
          "client/src/worded.tsx":
            'export const x = <Alert severity="error">{loadFailureMessage("Feats", error)}</Alert>;\n',
          "client/src/inline.tsx": 'export const i = <AnimatedAlert in severity="error">{error}</AnimatedAlert>;\n',
          "client/src/info.tsx": 'export const n = <Alert severity="info">Loading feats</Alert>;\n',
          "client/src/braced.tsx": 'export const b = <Alert severity={"error"}>{error}</Alert>;\n',
          "client/src/templated.tsx": "export const t = <Alert severity={`error`}>{error}</Alert>;\n",
          "client/src/colored.tsx": 'export const c = <Alert color="error">{error}</Alert>;\n',
          "client/src/computed.tsx": "export const k = <Alert severity={kind}>{message}</Alert>;\n",
          "client/src/contexts/ToastContext.tsx":
            "export const q = <Alert severity={current.severity}>{text}</Alert>;\n",
          "client/src/components/common/LoadError.tsx":
            'export const l = <Alert severity="error">{loadFailureMessage(what, error)}</Alert>;\n',
          "client/src/components/auth/AuthLayout.tsx": 'export const a = <Alert severity="error">{error}</Alert>;\n',
        },
        ["error-alerts"],
      ),
    ).toEqual([
      "error-alerts client/src/braced.tsx",
      "error-alerts client/src/colored.tsx",
      "error-alerts client/src/computed.tsx",
      "error-alerts client/src/inline.tsx",
      "error-alerts client/src/templated.tsx",
      "error-alerts client/src/worded.tsx",
      "error-alerts client/src/written.tsx",
    ]);
  });

  test("a date is shown through lib/formatDate.ts, the one place that formats one", async () => {
    expect(
      await lintRepo(
        {
          "client/src/localized.tsx": "export const d = new Date(at).toLocaleDateString();\n",
          "client/src/timed.tsx": "export const t = new Date(at).toLocaleTimeString();\n",
          "client/src/intl.tsx": 'export const f = new Intl.DateTimeFormat("en").format(new Date(at));\n',
          "client/src/relative.tsx": 'export const r = new Intl.RelativeTimeFormat().format(-1, "day");\n',
          "client/src/called.tsx": 'export const c = Intl.DateTimeFormat("en").format(new Date(at));\n',
          "client/src/destructured.tsx": "const { DateTimeFormat } = Intl;\nexport const f = new DateTimeFormat();\n",
          "client/src/stringified.tsx": "export const s = new Date(at).toLocaleString();\n",
          "client/src/counted.tsx":
            "export const n = count.toLocaleString() + new Intl.NumberFormat().format(total);\n",
          "client/src/lib/formatDate.ts":
            "export function formatDate(date: string) {\n  return new Intl.DateTimeFormat().format(new Date(date));\n}\n",
        },
        ["date-formats"],
      ),
    ).toEqual([
      "date-formats client/src/called.tsx",
      "date-formats client/src/destructured.tsx",
      "date-formats client/src/intl.tsx",
      "date-formats client/src/localized.tsx",
      "date-formats client/src/relative.tsx",
      "date-formats client/src/stringified.tsx",
      "date-formats client/src/timed.tsx",
    ]);
  });

  test("a style is written with sx: no styled(), no stylesheet but the global one, style only passed on", async () => {
    expect(
      await lintRepo(
        {
          "client/src/styled.tsx": 'export const s = <Box style={{ color: "red" }} />;\n',
          "client/src/slotted.tsx":
            'export const t = <TextField slotProps={{ htmlInput: { style: { textAlign: "center" } } }} />;\n',
          "client/src/passed.tsx": "export const p = <div style={{ ...props.style, flex: 1 }} />;\n",
          "client/src/themed.tsx": 'export const x = <Box sx={{ color: "red" }} />;\n',
          "client/src/plain.ts": 'export const style = { color: "red" };\n',
          "client/src/made.tsx":
            'import { styled } from "@mui/material/styles";\nexport const M = styled("div")({});\n',
          "client/src/spaced.tsx": 'import * as M from "@mui/material";\nexport const S = M.styled("div")({});\n',
          "client/src/emotion.tsx": 'import styled from "@emotion/styled";\nexport const E = styled.div({});\n',
          "client/src/sheet.tsx": 'import "./sheet.css";\nexport const c = 1;\n',
          "client/src/main.tsx": 'import "./index.css";\nexport const m = 1;\n',
        },
        ["sx-styles"],
      ),
    ).toEqual([
      "sx-styles client/src/emotion.tsx",
      "sx-styles client/src/made.tsx",
      "sx-styles client/src/sheet.tsx",
      "sx-styles client/src/slotted.tsx",
      "sx-styles client/src/spaced.tsx",
      "sx-styles client/src/styled.tsx",
    ]);
  });

  test("a color is the theme's: a palette token, translucent through alpha(), never written out", async () => {
    expect(
      await lintRepo(
        {
          "client/src/hex.tsx": 'export const h = <Box sx={{ color: "#fff" }} />;\n',
          "client/src/rgba.tsx": 'export const r = <Box sx={{ boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }} />;\n',
          "client/src/bordered.tsx": "export const b = <Box sx={{ border: `1px solid #c0c0c0` }} />;\n",
          "client/src/named.tsx": 'export const n = <Box sx={{ color: "white" }} />;\n',
          "client/src/suffixed.tsx":
            "export const s = <Box sx={{ boxShadow: (t) => `0 4px ${t.palette.primary.main}40` }} />;\n",
          "client/src/tokens.tsx":
            'export const t = <Box sx={{ color: "common.white", bgcolor: (t) => alpha(t.palette.common.black, 0.5) }} />;\n',
          "client/src/channel.ts": 'export const c = "0 0 0 3px rgba(var(--mui-palette-primary-mainChannel) / 0.4)";\n',
          "client/src/words.tsx": 'export const w = <Chip label="white" href="#top" sx={{ width: `${size}px` }} />;\n',
          "client/src/theme/palette.ts": 'export const p = { main: "#8d1e1e", shadow: "rgba(0, 0, 0, 0.3)" };\n',
          "client/src/compound.tsx": 'export const c = <Box sx={{ border: "1px solid red" }} />;\n',
          "client/src/oklch.tsx": 'export const o = <Box sx={{ color: "oklch(0.7 0.1 30)" }} />;\n',
          "client/src/swatch.tsx": 'import { red } from "@mui/material/colors";\nexport const r = red[500];\n',
          "client/src/painted.tsx": 'export const p = <path fill="#4285F4" />;\n',
          "client/src/anchored.tsx": 'export const a = <a href="#add">Add</a>;\n',
          "client/src/greyed.ts": 'export const g = { color: "grey.700" };\n',
          "client/src/paletted.ts": "export const p = theme.palette.grey[600];\n",
          "client/src/counted.tsx": "export const n = `${count}00 points`;\n",
          "client/src/greyed.tsx":
            'export const g = <Chip sx={{ bgcolor: "text.secondary", color: "common.white" }} />;\n',
        },
        ["theme-colors"],
      ),
    ).toEqual([
      "theme-colors client/src/bordered.tsx",
      "theme-colors client/src/compound.tsx",
      "theme-colors client/src/greyed.ts",
      "theme-colors client/src/hex.tsx",
      "theme-colors client/src/named.tsx",
      "theme-colors client/src/oklch.tsx",
      "theme-colors client/src/painted.tsx",
      "theme-colors client/src/paletted.ts",
      "theme-colors client/src/rgba.tsx",
      "theme-colors client/src/suffixed.tsx",
      "theme-colors client/src/swatch.tsx",
    ]);
  });

  test("a component's props are one named type, never written in place", async () => {
    expect(
      await lintRepo(
        {
          "client/src/literal.tsx": "export function Literal({ label }: { label: string }) {\n  return label;\n}\n",
          "client/src/joined.tsx":
            "export function Joined({ label }: BaseProps & { label: string }) {\n  return label;\n}\n",
          "client/src/omitted.tsx":
            'export function Omitted(props: Omit<ButtonProps, "size">) {\n  return props.children;\n}\n',
          "client/src/qualified.tsx":
            "export function Qualified(props: React.ComponentProps<typeof Box>) {\n  return props.children;\n}\n",
          "client/src/own.tsx":
            "interface OwnProps {\n  label: string;\n}\n\nexport function Own({ label }: OwnProps) {\n  return label;\n}\n",
          "client/src/shared.tsx":
            "export function FeatsSection({ ruleset }: RulesetSectionProps) {\n  return ruleset.name;\n}\n",
          "client/src/helper.tsx": "export function labelOf({ label }: { label: string }) {\n  return label;\n}\n",
          "client/src/bare.tsx": "export function Bare() {\n  return null;\n}\n",
          "client/src/memoized.tsx":
            "export const M = memo(function M({ label }: { label: string }) {\n  return label;\n});\n",
          "client/src/forwarded.tsx":
            'export const F = React.forwardRef(function F(props: Omit<BoxProps, "ref">) {\n  return null;\n});\n',
          "client/src/wrapped.tsx": "export const W = memo(function W({ label }: WProps) {\n  return label;\n});\n",
        },
        ["component-props"],
      ),
    ).toEqual([
      "component-props client/src/forwarded.tsx",
      "component-props client/src/joined.tsx",
      "component-props client/src/literal.tsx",
      "component-props client/src/memoized.tsx",
      "component-props client/src/omitted.tsx",
      "component-props client/src/qualified.tsx",
    ]);
  });

  test("an icon comes from components/icons, named for what it means", async () => {
    expect(
      await lintRepo(
        {
          "client/src/named.tsx":
            'import { Group as ContributorsIcon } from "@mui/icons-material";\nexport const c = ContributorsIcon;\n',
          "client/src/pathed.tsx":
            'import HelpOutline from "@mui/icons-material/HelpOutlined";\nexport const h = HelpOutline;\n',
          "client/src/mapped.tsx":
            'import { ContributorsIcon } from "@/client/src/components/icons/index.ts";\nexport const c = ContributorsIcon;\n',
          "client/src/components/icons/index.ts": 'export { Group as ContributorsIcon } from "@mui/icons-material";\n',
        },
        ["icons"],
      ),
    ).toEqual(["icons client/src/named.tsx", "icons client/src/pathed.tsx"]);
  });

  test("a control that only navigates is a link, and Link has one name per package", async () => {
    expect(
      await lintRepo(
        {
          "client/src/button.tsx": 'export const b = <Button onClick={() => navigate("/sign-up")}>Sign up</Button>;\n',
          "client/src/block.tsx": "export const k = <IconButton onClick={() => { navigate(path); }} />;\n",
          "client/src/linked.tsx": 'export const l = <Button component={Link} to="/sign-up">Sign up</Button>;\n',
          "client/src/history.tsx": "export const h = <IconButton onClick={() => navigate(-1)} />;\n",
          "client/src/more.tsx": 'export const m = <Button onClick={() => { save(); navigate("/x"); }} />;\n',
          "client/src/card.tsx": "export const c = <ListCard onClick={() => navigate(`/rulesets/${id}`)} />;\n",
          "client/src/left.tsx": 'export const s = <ContributorsSection onLeave={() => navigate("/rulesets")} />;\n',
          "client/src/router.tsx":
            'import { Link as RouterLink } from "react-router-dom";\nexport const r = RouterLink;\n',
          "client/src/mui.tsx": 'import { Link } from "@mui/material";\nexport const m = Link;\n',
          "client/src/both.tsx":
            'import { Link as MuiLink } from "@mui/material";\nimport { Link } from "react-router-dom";\nexport const b = [Link, MuiLink];\n',
        },
        ["nav-links"],
      ),
    ).toEqual([
      "nav-links client/src/block.tsx",
      "nav-links client/src/button.tsx",
      "nav-links client/src/mui.tsx",
      "nav-links client/src/router.tsx",
    ]);
  });

  test("what the browser keeps is a store's", async () => {
    expect(
      await lintRepo(
        {
          "client/src/local.ts": 'export const l = localStorage.getItem("themeMode");\n',
          "client/src/session.ts": "export const s = window.sessionStorage;\n",
          "client/src/stores/prefs.ts": 'export const p = localStorage.getItem("themeMode");\n',
          "client/src/keyed.ts": "export const k = { localStorage: 1 }.localStorage;\n",
        },
        ["browser-storage"],
      ),
    ).toEqual(["browser-storage client/src/local.ts", "browser-storage client/src/session.ts"]);
  });

  test("motion is timed in lib/animations.ts, by its animations, transitionOf and its tokens", async () => {
    expect(
      await lintRepo(
        {
          "client/src/written.tsx": 'export const w = <Box sx={{ transition: "opacity 0.2s ease" }} />;\n',
          "client/src/curved.ts": 'export const c = "all 1s cubic-bezier(0.2, 0, 0, 1)";\n',
          "client/src/templated.tsx": "export const t = <Box sx={{ animation: `${fadeIn} 300ms ease-in` }} />;\n",
          "client/src/computed.tsx":
            "export const k = <Box sx={{ animation: `${fadeInUp} ${DURATION.slow}ms ${i * 80}ms` }} />;\n",
          "client/src/framed.tsx": 'export const f = { "@keyframes spin": { to: { rotate: "1turn" } } };\n',
          "client/src/faded.tsx": 'import { Fade } from "@mui/material";\nexport const f = Fade;\n',
          "client/src/spun.tsx":
            'import { keyframes } from "@mui/material";\nexport const s = keyframes`to { opacity: 1; }`;\n',
          "client/src/tokened.tsx":
            'export const o = <Box sx={{ transition: transitionOf(["opacity"], DURATION.fast), animation: `${fadeIn} ${DURATION.normal}ms ${EASING.standard}` }} />;\n',
          "client/src/named.tsx":
            'export const n = <Box sx={{ animation: ANIMATIONS.diceRoll, [reduced]: { animation: "none" } }} />;\n',
          "client/src/lib/animations.ts": 'export const EASING = { standard: "cubic-bezier(0.4, 0, 0.2, 1)" };\n',
        },
        ["motion"],
      ),
    ).toEqual([
      "motion client/src/computed.tsx",
      "motion client/src/curved.ts",
      "motion client/src/faded.tsx",
      "motion client/src/framed.tsx",
      "motion client/src/spun.tsx",
      "motion client/src/templated.tsx",
      "motion client/src/written.tsx",
    ]);
  });

  test("a size is the theme's: text takes a variant, an icon its size, a weight is a number", async () => {
    expect(
      await lintRepo(
        {
          "client/src/rem.tsx": 'export const r = <Chip sx={{ fontSize: "0.75rem" }} />;\n',
          "client/src/pixels.tsx": "export const p = <HelpIcon sx={{ fontSize: 18 }} />;\n",
          "client/src/responsive.tsx": "export const s = <Icon sx={{ fontSize: { xs: 48, sm: 64 } }} />;\n",
          "client/src/worded.tsx": 'export const w = <Typography sx={{ fontWeight: "bold" }} />;\n',
          "client/src/fixed.tsx": 'export const f = <Typography sx={{ typography: "body2" }} />;\n',
          "client/src/variants.tsx":
            'export const v = <Typography variant="body2" sx={{ fontWeight: 600, typography: { xs: "body1", sm: "h6" } }} />;\n',
          "client/src/boxed.tsx": 'export const b = <Box sx={{ typography: "caption" }} />;\n',
          "client/src/sized.tsx": 'export const z = <HelpIcon fontSize="compact" sx={{ fontSize: "inherit" }} />;\n',
          "client/src/computed.tsx": "export const c = <PhotoIcon sx={{ fontSize: dimension * 0.22 }} />;\n",
          "client/src/theme/appTheme.ts": 'export const t = { h1: { fontSize: "2.5rem" } };\n',
        },
        ["type-scale"],
      ),
    ).toEqual([
      "type-scale client/src/fixed.tsx",
      "type-scale client/src/pixels.tsx",
      "type-scale client/src/rem.tsx",
      "type-scale client/src/responsive.tsx",
      "type-scale client/src/worded.tsx",
    ]);
  });

  test("a corner and a layer are the theme's", async () => {
    expect(
      await lintRepo(
        {
          "client/src/pixels.tsx": 'export const p = <Box sx={{ borderRadius: "8px 8px 0 0" }} />;\n',
          "client/src/layered.tsx": "export const l = <Box sx={{ zIndex: 1300 }} />;\n",
          "client/src/spaced.tsx": 'export const s = <Box sx={{ mt: "16px" }} />;\n',
          "client/src/units.tsx":
            "export const u = <Box sx={{ borderRadius: 1, borderBottomLeftRadius: 0, zIndex: 1, top: 0 }} />;\n",
          "client/src/round.tsx":
            'export const r = <Box sx={{ borderRadius: "50%", zIndex: (t) => t.zIndex.drawer + 1 }} />;\n',
        },
        ["shape"],
      ),
    ).toEqual(["shape client/src/layered.tsx", "shape client/src/pixels.tsx", "shape client/src/spaced.tsx"]);
  });

  test("a border is the theme's shorthand, and a surface takes its elevation and outline as props", async () => {
    expect(
      await lintRepo(
        {
          "client/src/stringed.tsx": 'export const s = <Box sx={{ border: "1px solid", borderColor: "divider" }} />;\n',
          "client/src/branched.tsx": 'export const b = <Box sx={{ border: ring ? "4px solid" : 2 }} />;\n',
          "client/src/templated.tsx":
            "export const t = <Box sx={{ borderTop: (t) => `2px solid ${t.palette.divider}` }} />;\n",
          "client/src/shadowed.tsx": "export const p = <Paper sx={{ p: 2, boxShadow: 1 }} />;\n",
          "client/src/outlined.tsx": 'export const o = <Card sx={[{ border: 1, borderColor: "divider" }, sx]} />;\n',
          "client/src/widths.tsx":
            'export const w = <Box sx={{ border: 1, borderLeft: ring ? 3 : 0, borderStyle: "dashed", borderColor: "divider", boxShadow: 2 }} />;\n',
          "client/src/props.tsx":
            'export const q = <Paper variant="outlined" elevation={0} sx={{ borderRadius: 2, borderColor: "warning.light" }} />;\n',
          "client/src/none.tsx": 'export const n = <Box sx={{ borderBottom: open ? "none" : 1 }} />;\n',
        },
        ["borders"],
      ),
    ).toEqual([
      "borders client/src/branched.tsx",
      "borders client/src/outlined.tsx",
      "borders client/src/shadowed.tsx",
      "borders client/src/stringed.tsx",
      "borders client/src/templated.tsx",
    ]);
  });

  test("a flex container is a Stack, its direction and spacing props", async () => {
    expect(
      await lintRepo(
        {
          "client/src/boxed.tsx": 'export const b = <Box sx={{ display: "flex", gap: 1 }} />;\n',
          "client/src/arrayed.tsx": 'export const a = <Box sx={[{ display: "inline-flex" }, sx]} />;\n',
          "client/src/called.tsx":
            'export const c = <Box sx={(theme) => ({ display: { xs: "none", sm: "flex" } })} />;\n',
          "client/src/gapped.tsx":
            'export const g = <Stack direction="row" sx={{ gap: 2, alignItems: "center" }} />;\n',
          "client/src/turned.tsx": 'export const t = <Stack sx={{ flexDirection: "row" }} />;\n',
          "client/src/stacked.tsx":
            'export const s = <Stack direction="row" spacing={2} sx={{ alignItems: "center" }} />;\n',
          "client/src/gridded.tsx":
            'export const r = <Box sx={{ display: "grid", gap: 2, "& .row": { display: "flex" } }} />;\n',
          "client/src/toolbar.tsx": 'export const o = <Toolbar sx={{ display: "flex", gap: 1 }} />;\n',
        },
        ["flex-layout"],
      ),
    ).toEqual([
      "flex-layout client/src/arrayed.tsx",
      "flex-layout client/src/boxed.tsx",
      "flex-layout client/src/called.tsx",
      "flex-layout client/src/gapped.tsx",
      "flex-layout client/src/turned.tsx",
    ]);
  });

  test("what the theme sets for every instance isn't set again on one", async () => {
    expect(
      await lintRepo(
        {
          "client/src/arrowed.tsx": 'export const a = <Tooltip title="x" arrow><span /></Tooltip>;\n',
          "client/src/delayed.tsx": 'export const d = <Tooltip title="x" enterDelay={400}><span /></Tooltip>;\n',
          "client/src/timed.tsx": 'export const t = <Collapse in={open} timeout="auto" />;\n',
          "client/src/placed.tsx":
            'export const p = <Tooltip title="x" placement="right" describeChild><span /></Tooltip>;\n',
          "client/src/opened.tsx": "export const o = <Collapse in={open} unmountOnExit />;\n",
        },
        ["component-defaults"],
      ),
    ).toEqual([
      "component-defaults client/src/arrowed.tsx",
      "component-defaults client/src/delayed.tsx",
      "component-defaults client/src/timed.tsx",
    ]);
  });

  test("a button's, a menu item's and a dialog's words are in Title Case", async () => {
    expect(
      await lintRepo(
        {
          "client/src/button.tsx": "export const b = <Button>Mark all read</Button>;\n",
          "client/src/menu.tsx": 'export const m = <ActionMenuItem label="Delete permanently" />;\n',
          "client/src/dialog.tsx": 'export const d = <ConfirmDialog title="Local changes" confirmLabel="Restore" />;\n',
          "client/src/titled.tsx": "export const t = <DialogTitle>License & attribution</DialogTitle>;\n",
          "client/src/cased.tsx":
            'export const c = <><Button>Mark All as Read</Button><ConfirmDialog title="Delete Permanently" /><DialogTitle>Create Variants of {name}</DialogTitle></>;\n',
          "client/src/tooltip.tsx":
            'export const o = <Tooltip title="Opens the sheet in a new tab"><span /></Tooltip>;\n',
          "client/src/chip.tsx": 'export const p = <Chip label="not equipped" />;\n',
        },
        ["label-case"],
      ),
    ).toEqual([
      "label-case client/src/button.tsx",
      "label-case client/src/dialog.tsx",
      "label-case client/src/menu.tsx",
      "label-case client/src/titled.tsx",
    ]);
  });

  test("a search box is a SearchField", async () => {
    expect(
      await lintRepo(
        {
          "client/src/plain.tsx": 'export const p = <TextField placeholder="Search feats..." value={q} />;\n',
          "client/src/templated.tsx": "export const t = <TextField placeholder={`Search ${pool} spells...`} />;\n",
          "client/src/named.tsx": 'export const n = <TextField label="Name" placeholder="e.g. Fireball" />;\n',
          "client/src/shared.tsx":
            'export const s = <SearchField placeholder="Search feats..." value={q} onChange={setQ} />;\n',
          "client/src/components/common/SearchField.tsx": 'export const f = <TextField placeholder="Search" />;\n',
        },
        ["search-fields"],
      ),
    ).toEqual(["search-fields client/src/plain.tsx", "search-fields client/src/templated.tsx"]);
  });

  test("a button is styled by its intent, as docs/ui-buttons.md sets it", async () => {
    expect(
      await lintRepo(
        {
          "client/src/leave.tsx": 'export const l = <Button variant="outlined" color="warning">Leave</Button>;\n',
          "client/src/cancel.tsx": 'export const c = <Button color="inherit">Cancel</Button>;\n',
          "client/src/delete.tsx": "export const d = <Button>Delete Account</Button>;\n",
          "client/src/kept.tsx":
            'export const k = <><Button variant="contained" color="error">Delete</Button><Button variant="outlined" color="inherit">Cancel</Button></>;\n',
          "client/src/other.tsx": 'export const o = <Button variant="text">View All</Button>;\n',
          "client/src/computed.tsx": 'export const p = <Button variant={variant} color="success">Publish</Button>;\n',
        },
        ["button-intents"],
      ),
    ).toEqual([
      "button-intents client/src/cancel.tsx",
      "button-intents client/src/delete.tsx",
      "button-intents client/src/leave.tsx",
    ]);
  });

  test("a Typography sized as a heading declares its element", async () => {
    expect(
      await lintRepo(
        {
          "client/src/variant.tsx": 'export const v = <Typography variant="h6">Diagnostics</Typography>;\n',
          "client/src/styled.tsx":
            'export const s = <Typography sx={{ typography: { xs: "h6", sm: "h5" } }}>Players</Typography>;\n',
          "client/src/declared.tsx":
            'export const d = <Typography component="h2" variant="h6">Diagnostics</Typography>;\n',
          "client/src/text.tsx":
            'export const t = <Typography variant="body2" sx={{ typography: "caption" }}>Note</Typography>;\n',
        },
        ["headings"],
      ),
    ).toEqual(["headings client/src/styled.tsx", "headings client/src/variant.tsx"]);
  });

  test("a toast is a phrase, and an error's fallback names what failed", async () => {
    expect(
      await lintRepo(
        {
          "client/src/success.ts": 'export const s = () => snackbar.success("Ruleset archived successfully");\n',
          "client/src/bang.ts": "export const b = () => snackbar.success(`${label} accepted!`);\n",
          "client/src/sentence.ts":
            'export const w = () => snackbar.warning(ok ? "Saved" : "This export has expired.");\n',
          "client/src/fallback.ts":
            'export const f = (error: unknown) => snackbar.error(error, "Could not remove the item");\n',
          "client/src/phrases.ts":
            'export const p = (error: unknown) => { snackbar.success("Ruleset archived"); snackbar.error(error, "Failed to remove item"); snackbar.warning("This export expired: generate a new one"); };\n',
        },
        ["toast-wording"],
      ),
    ).toEqual([
      "toast-wording client/src/bang.ts",
      "toast-wording client/src/fallback.ts",
      "toast-wording client/src/sentence.ts",
      "toast-wording client/src/success.ts",
    ]);
  });

  test("a confirmation asks Are you sure you want to, and a deletion says it can't be undone", async () => {
    expect(
      await lintRepo(
        {
          "client/src/stated.tsx": 'export const s = <ConfirmDialog message="Discard all level-up progress?" />;\n',
          "client/src/undone.tsx":
            'export const u = <DeleteDialog message="Are you sure you want to delete this modifier?" />;\n',
          "client/src/asked.tsx":
            'export const a = <><ConfirmDialog message="Are you sure you want to archive this ruleset? You can restore it later." /><DeleteDialog message={`Are you sure you want to delete this ${label}? This action cannot be undone.`} /></>;\n',
          "client/src/composed.tsx":
            "export const c = <ConfirmDialog message={<>Remove <strong>{name}</strong>?</>} />;\n",
        },
        ["confirm-wording"],
      ),
    ).toEqual(["confirm-wording client/src/stated.tsx", "confirm-wording client/src/undone.tsx"]);
  });

  test("a page that couldn't load says why in loadFailureMessage's words", async () => {
    expect(
      await lintRepo(
        {
          "client/src/written.tsx":
            'export const w = <PageError message="Failed to load your profile. Please try again later." />;\n',
          "client/src/branched.tsx":
            'export const b = <EntityPageError message={ok ? loadFailureMessage("Ruleset", e) : `Invalid type: ${t}`} />;\n',
          "client/src/worded.tsx":
            'export const o = <><PageError message={loadFailureMessage("Profile", error)} /><EntityPageError message={r ? loadFailureMessage("Ruleset", e) : loadFailureMessage("Class", f)} /></>;\n',
        },
        ["page-errors"],
      ),
    ).toEqual(["page-errors client/src/branched.tsx", "page-errors client/src/written.tsx"]);
  });

  test("a role, a status or a fact is a TagChip, and a chip's color is its color prop", async () => {
    expect(
      await lintRepo(
        {
          "client/src/iconed.tsx": 'export const i = <Chip icon={<PlayerIcon />} label="Active" />;\n',
          "client/src/painted.tsx":
            'export const p = <Chip label={race} sx={{ bgcolor: "primary.main", fontWeight: 500 }} />;\n',
          "client/src/tagged.tsx":
            'export const t = <TagChip tag={{ icon: PlayerIcon, label: "Active", color: "success" }} />;\n',
          "client/src/plain.tsx":
            'export const c = <Chip label={count} size="tiny" color="primary" sx={{ ml: 1 }} />;\n',
          "client/src/components/common/TagChip.tsx": "export const x = <Chip icon={<Icon />} label={label} />;\n",
        },
        ["tag-chips"],
      ),
    ).toEqual(["tag-chips client/src/iconed.tsx", "tag-chips client/src/painted.tsx"]);
  });

  test("a dialog's header is its DialogTitle, and it closes with its Close button", async () => {
    expect(
      await lintRepo(
        {
          "client/src/toolbar.tsx":
            "export const t = <Modal open><Toolbar><Typography>Manage</Typography></Toolbar></Modal>;\n",
          "client/src/icon.tsx": 'export const i = <IconButton aria-label="Close" onClick={onClose} />;\n',
          "client/src/titled.tsx":
            'export const d = <Modal open><DialogTitle>Manage</DialogTitle><DialogActions><Button variant="outlined" color="inherit">Close</Button></DialogActions></Modal>;\n',
          "client/src/page.tsx": "export const p = <AppBar><Toolbar /></AppBar>;\n",
        },
        ["dialog-conventions"],
      ),
    ).toEqual(["dialog-conventions client/src/icon.tsx", "dialog-conventions client/src/toolbar.tsx"]);
  });

  test("a toggle shows its state with ExpandArrow, an accordion with its own expandIcon", async () => {
    expect(
      await lintRepo(
        {
          "client/src/swapped.tsx": "export const s = open ? <ExpandLessIcon /> : <ExpandMoreIcon />;\n",
          "client/src/arrowed.tsx":
            "export const a = <Stack {...toggleProps(open, toggle)}><ExpandArrow open={open} /></Stack>;\n",
          "client/src/accordion.tsx":
            "export const c = <AccordionSummary expandIcon={<ExpandMoreIcon />}>Diagnostics</AccordionSummary>;\n",
        },
        ["expand-arrows"],
      ),
    ).toEqual(["expand-arrows client/src/swapped.tsx", "expand-arrows client/src/swapped.tsx"]);
  });

  test("a button that starts a request shows it running", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bare.tsx":
            "export const b = <Button onClick={() => m.mutate()} disabled={m.isPending}>Mark All as Read</Button>;\n",
          "client/src/spun.tsx":
            '<Button onClick={() => m.mutate()} disabled={m.isPending}><DiceSpinner size="small" loading={m.isPending}>Save</DiceSpinner></Button>;\n',
          "client/src/opener.tsx":
            "export const o = <Button onClick={() => setOpen(true)} disabled={m.isPending}>Revoke Link</Button>;\n",
        },
        ["pending-buttons"],
      ),
    ).toEqual(["pending-buttons client/src/bare.tsx"]);
  });
});
