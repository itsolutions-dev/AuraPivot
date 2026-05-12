import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Slider,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import { usePivot } from "../../context/PivotContext";
import { usePortalContainer } from "../../hooks/usePortalContainer";

/**
 * Format customization dialog. Modeled after the auraPivot format panel:
 *
 *   - Tab "Generale": font family, size, weight, italic, text / background
 *     color, alignment and number-format options (decimal places, thousands
 *     separator, currency symbol).
 *   - Tab "Condizionale": an ordered list of rules that apply a style when
 *     a cell's numeric value matches an operator (>, >=, <, <=, =, ≠,
 *     between). Each rule can target a specific measure or all measures.
 *
 * The resulting format object is pushed to the engine via `setFormat()` on
 * "Applica", triggering a re-render of the grid through the `formatChange`
 * event exposed to the PivotContext consumer.
 */

const FONT_FAMILIES = [
  "Inter",
  "Roboto",
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Verdana",
];

const PRESET_COLORS = [
  "#000000",
  "#FFFFFF",
  "#9E9E9E",
  "#F44336",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
  "#3F51B5",
  "#2196F3",
  "#03A9F4",
  "#00BCD4",
  "#009688",
  "#4CAF50",
  "#8BC34A",
  "#CDDC39",
  "#FFEB3B",
  "#FFC107",
  "#FF9800",
  "#FF5722",
  "#795548",
];

const ColorSwatches = function ColorSwatches({ value, onChange }) {
  return (
    <Stack direction="row" flexWrap="wrap" gap={0.5}>
      {PRESET_COLORS.map((c) => {
        const selected = value && value.toLowerCase() === c.toLowerCase();
        return (
          <Box
            key={c}
            component="button"
            type="button"
            onClick={() => onChange(c)}
            sx={(theme) => ({
              width: 20,
              height: 20,
              borderRadius: "50%",
              cursor: "pointer",
              backgroundColor: c,
              padding: 0,
              border: selected
                ? `2px solid ${theme.palette.primary.main}`
                : `1px solid ${theme.palette.divider}`,
              boxShadow: selected
                ? `0 0 0 1px ${theme.palette.background.paper} inset`
                : "none",
            })}
          />
        );
      })}
    </Stack>
  );
};

ColorSwatches.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

const DEFAULT_RULE_STYLE = {
  textColor: "#000000",
  backgroundColor: "#FFEB3B",
  fontWeight: 600,
  italic: false,
};

const ColorField = function ColorField({ label, value, onChange }) {
  return (
    <Stack
      sx={{
        marginTop: (theme) => theme.spacing(1),
        marginBottom: (theme) => theme.spacing(1),
      }}
      direction="row"
      alignItems="flex-start"
      spacing={2}
    >
      <Typography
        variant="caption"
        sx={{ minWidth: 110, opacity: 0.75, pt: 0.5 }}
      >
        {label}
      </Typography>
      <Stack spacing={1} sx={{ flex: 1 }}>
        <ColorSwatches value={value} onChange={onChange} />
        <Stack direction="row" style={{ alignItems: "center" }} spacing={1}>
          <Box
            component="input"
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            sx={{
              width: 36,
              height: 28,
              border: "none",
              borderRadius: 1,
              cursor: "pointer",
              backgroundColor: "transparent",
              padding: 0,
            }}
          />
          <TextField
            size="small"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#RRGGBB"
            sx={(theme) => ({
              flex: 1,
              "& input": {
                fontFamily: "monospace",
                fontSize: theme.typography.fontSize,
              },
            })}
          />
          {value && (
            <IconButton size="small" onClick={() => onChange(null)}>
              <CloseIcon fontSize="inherit" />
            </IconButton>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
};

ColorField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

const SectionLabel = function SectionLabel({ children }) {
  return (
    <Typography
      variant="caption"
      sx={(theme) => ({
        display: "block",
        fontWeight: theme.typography.caption.fontWeight,
        opacity: 0.75,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        my: 1.0,
      })}
    >
      {children}
    </Typography>
  );
};

SectionLabel.propTypes = {
  children: PropTypes.node.isRequired,
};

const SectionEditor = function SectionEditor({
  section,
  setSection,
  showNumberFormat,
  showAlignment = true,
}) {
  const { localization: t } = usePivot();
  const patch = (upd) => setSection({ ...section, ...upd });
  return (
    <Stack gap={3} sx={{ pt: 1.5 }}>
      <Stack gap={1.25}>
        <SectionLabel>
          {t?.formatDialog?.sectionTypography || "Typography"}
        </SectionLabel>
        <Stack direction="row" spacing={2}>
          <Stack gap={0.5} sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {t?.formatDialog?.font || "Font"}
            </Typography>
            <Select
              size="small"
              value={section.fontFamily || "inherit"}
              onChange={(e) => patch({ fontFamily: e.target.value })}
            >
              <MenuItem value="inherit">
                <em>{t?.formatDialog?.fontDefault || "Default (theme)"}</em>
              </MenuItem>
              {FONT_FAMILIES.map((f) => (
                <MenuItem key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </MenuItem>
              ))}
            </Select>
          </Stack>
          <Stack gap={0.5} sx={{ width: 160 }}>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {t?.formatDialog?.fontSize || "Size"} ({section.fontSize || 13}px)
            </Typography>
            <Slider
              size="small"
              min={10}
              max={24}
              sx={(theme) => ({ fontSize: theme.typography.fontSize })}
              onChange={(_, v) => patch({ fontSize: v })}
            />
          </Stack>
        </Stack>
      </Stack>

      <Stack gap={8.25}>
        <SectionLabel>
          {t?.formatDialog?.sectionStyle || "Style & alignment"}
        </SectionLabel>
        <Stack direction="row" spacing={1.5} style={{ alignItems: "center" }}>
          <ToggleButtonGroup
            size="small"
            value={[
              section.fontWeight >= 600 ? "bold" : null,
              section.italic ? "italic" : null,
            ].filter(Boolean)}
            onChange={(_, v) => {
              patch({
                fontWeight: v.includes("bold") ? 700 : 400,
                italic: v.includes("italic"),
              });
            }}
          >
            <ToggleButton value="bold">
              <FormatBoldIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="italic">
              <FormatItalicIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>

          {showAlignment && (
            <>
              <Divider orientation="vertical" flexItem />

              <ToggleButtonGroup
                size="small"
                exclusive
                value={section.textAlign}
                onChange={(_, v) => v && patch({ textAlign: v })}
              >
                <ToggleButton value="left">
                  <FormatAlignLeftIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="center">
                  <FormatAlignCenterIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="right">
                  <FormatAlignRightIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>
            </>
          )}
        </Stack>
      </Stack>

      <Stack gap={1.5}>
        <SectionLabel>
          {t?.formatDialog?.sectionColors || "Colors"}
        </SectionLabel>
        <ColorField
          label={t?.formatDialog?.textColorLabel || "Text color"}
          value={section.textColor}
          onChange={(v) => patch({ textColor: v })}
        />
        <ColorField
          label={t?.formatDialog?.bgColorLabel || "Background color"}
          value={section.backgroundColor}
          onChange={(v) => patch({ backgroundColor: v })}
        />
      </Stack>

      {showNumberFormat && (
        <>
          <Divider
            sx={{
              marginTop: (theme) => theme.spacing(1),
              marginBottom: (theme) => theme.spacing(1),
            }}
          />

          <SectionLabel>
            {t?.formatDialog?.numberFormat || "NUMBER FORMAT"}
          </SectionLabel>

          <Stack direction="row" spacing={1.5}>
            <Stack gap={0.5} sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {t?.formatDialog?.thousandSeparator || "Thousand Separator"}
              </Typography>
              <Select
                size="small"
                value={section.thousandSeparator ?? "System"}
                onChange={(e) => patch({ thousandSeparator: e.target.value })}
              >
                <MenuItem value="System">
                  {t?.formatDialog?.system || "System"}
                </MenuItem>
                <MenuItem value="None">
                  {t?.formatDialog?.none || "None"}
                </MenuItem>
                <MenuItem value=".">.</MenuItem>
                <MenuItem value=",">,</MenuItem>
              </Select>
            </Stack>
            <Stack gap={0.5} sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {t?.formatDialog?.decimalSeparator || "Decimal Separator"}
              </Typography>
              <Select
                size="small"
                value={section.decimalSeparator ?? "System"}
                onChange={(e) => patch({ decimalSeparator: e.target.value })}
              >
                <MenuItem value="System">
                  {t?.formatDialog?.system || "System"}
                </MenuItem>
                <MenuItem value=".">.</MenuItem>
                <MenuItem value=",">,</MenuItem>
              </Select>
            </Stack>
            <Stack gap={0.5} sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {t?.formatDialog?.numberOfDecimals || "Number of decimals"}
              </Typography>
              <Select
                size="small"
                value={section.numberOfDecimals ?? "Default"}
                onChange={(e) => patch({ numberOfDecimals: e.target.value })}
              >
                <MenuItem value="Default">
                  {t?.formatDialog?.default || "Default"}
                </MenuItem>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </Select>
            </Stack>
            <Stack gap={0.5} sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {t?.formatDialog?.currencySymbol || "Currency symbol"}
              </Typography>
              <Select
                size="small"
                value={section.currencySymbol ?? "None"}
                onChange={(e) => patch({ currencySymbol: e.target.value })}
              >
                <MenuItem value="None">
                  {t?.formatDialog?.none || "None"}
                </MenuItem>
                <MenuItem value="System">
                  {t?.formatDialog?.system || "System"}
                </MenuItem>
                <MenuItem value="$">$</MenuItem>
                <MenuItem value="€">€</MenuItem>
                <MenuItem value="£">£</MenuItem>
                <MenuItem value="Other">
                  {t?.formatDialog?.other || "Other"}
                </MenuItem>
              </Select>
            </Stack>
            <FormControlLabel
              sx={{ alignSelf: "flex-end", flex: 1, ml: 0 }}
              control={
                <Checkbox
                  checked={!!section.percentage}
                  onChange={(e) => patch({ percentage: e.target.checked })}
                />
              }
              label={t?.formatDialog?.percentage || "Format as percentage"}
            />
          </Stack>

          {section.currencySymbol && section.currencySymbol !== "None" && (
            <Stack
              direction="row"
              spacing={1.5}
              style={{ alignItems: "flex-end" }}
            >
              {section.currencySymbol === "Other" && (
                <TextField
                  size="small"
                  label={t?.formatDialog?.currencyOther || "Symbol"}
                  value={section.currencyOther || ""}
                  onChange={(e) => patch({ currencyOther: e.target.value })}
                  sx={{ flex: 1 }}
                />
              )}
              <Stack gap={0.5} sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  {t?.formatDialog?.currencyAlignment || "Currency alignment"}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={section.currencyAlignment || "Left"}
                  onChange={(_, v) => v && patch({ currencyAlignment: v })}
                >
                  <ToggleButton value="Left" sx={{ textTransform: "none" }}>
                    {t?.formatDialog?.left || "Left"}
                  </ToggleButton>
                  <ToggleButton value="Right" sx={{ textTransform: "none" }}>
                    {t?.formatDialog?.right || "Right"}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>
          )}

          <Stack
            direction="row"
            spacing={1.5}
            sx={(theme) => ({
              alignItems: "center",
              marginTop: theme.spacing(2),
            })}
          >
            <Stack gap={0.5}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {t?.formatDialog?.nullValue || "Null Value"}
              </Typography>
              <TextField
                size="small"
                value={section.nullValue ?? ""}
                onChange={(e) => patch({ nullValue: e.target.value })}
              />
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  );
};

SectionEditor.propTypes = {
  section: PropTypes.object.isRequired,
  setSection: PropTypes.func.isRequired,
  showNumberFormat: PropTypes.bool,
  showAlignment: PropTypes.bool,
};

const TotalsPositionEditor = function TotalsPositionEditor({
  layout,
  setLayout,
}) {
  const { localization: t } = usePivot();
  const patch = (upd) => setLayout({ ...layout, ...upd });
  return (
    <Stack gap={3} sx={{ pt: 1.5 }}>
      <Stack gap={0.5}>
        <SectionLabel>
          {t?.formatDialog?.totalsPosition || "TOTALS POSITION"}
        </SectionLabel>
        <Typography
          variant="caption"
          sx={(theme) => ({ opacity: 0.7, marginBottom: theme.spacing(2) })}
        >
          {t?.formatDialog?.totalsPositionDesc ||
            "Defines whether subtotals and the grand total are displayed before or after the data they aggregate."}
        </Typography>
      </Stack>

      <Stack
        direction="row"
        style={{
          marginBottom: (theme) => theme.spacing(1),
          alignItems: "center",
        }}
      >
        <Typography variant="body2" sx={{ minWidth: 140 }}>
          {t?.formatDialog?.totalsPerRow || "Totals per row"}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout.totalsRowsPosition || "before"}
          onChange={(_, v) => v && patch({ totalsRowsPosition: v })}
        >
          <ToggleButton value="before" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.beforeData || "Before data"}
          </ToggleButton>
          <ToggleButton value="after" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.afterData || "After data"}
          </ToggleButton>
          <ToggleButton value="none" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.noTotals || "None"}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Stack
        direction="row"
        style={{
          marginBottom: (theme) => theme.spacing(1),
          alignItems: "center",
        }}
      >
        <Typography variant="body2" sx={{ minWidth: 140 }}>
          {t?.formatDialog?.totalsPerColumn || "Totals per column"}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout.totalsColumnsPosition || "before"}
          onChange={(_, v) => v && patch({ totalsColumnsPosition: v })}
        >
          <ToggleButton value="before" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.beforeData || "Before data"}
          </ToggleButton>
          <ToggleButton value="after" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.afterData || "After data"}
          </ToggleButton>
          <ToggleButton value="none" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.noTotals || "None"}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
    </Stack>
  );
};

TotalsPositionEditor.propTypes = {
  layout: PropTypes.object.isRequired,
  setLayout: PropTypes.func.isRequired,
};

const LayoutTab = function LayoutTab({ layout, setLayout }) {
  const { localization: t } = usePivot();
  const patch = (upd) => setLayout({ ...layout, ...upd });
  return (
    <Stack gap={3} sx={{ pt: 1.5 }}>
      <Stack gap={0.5}>
        <SectionLabel>{t?.formatDialog?.title || "TITLE"}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {t?.formatDialog?.titleDesc ||
            "Shown above the toolbar. Leave empty to hide."}
        </Typography>
        <TextField
          size="small"
          value={layout.title ?? ""}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t?.formatDialog?.titlePlaceholder || "Report title"}
          sx={{ mt: 1 }}
        />
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(2),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack gap={0.5}>
        <SectionLabel>{t?.formatDialog?.density || "DENSITY"}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {t?.formatDialog?.densityDesc ||
            "Controls cell height, padding and font size of the grid."}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout.density || "Standard"}
          onChange={(_, v) => v && patch({ density: v })}
          sx={(theme) => ({
            alignSelf: "flex-start",
            marginTop: theme.spacing(2),
          })}
        >
          <ToggleButton value="Compact" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.densityCompact || "Compact"}
          </ToggleButton>
          <ToggleButton value="Standard" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.densityStandard || "Standard"}
          </ToggleButton>
          <ToggleButton value="Comfortable" sx={{ textTransform: "none" }}>
            {t?.formatDialog?.densityComfortable || "Comfortable"}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(2),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack gap={0.5}>
        <SectionLabel>
          {t?.formatDialog?.readability || "READABILITY"}
        </SectionLabel>
        <FormControlLabel
          control={
            <Checkbox
              checked={!!layout.alternateRows}
              onChange={(e) => patch({ alternateRows: e.target.checked })}
            />
          }
          label={
            t?.formatDialog?.alternateRows ||
            "Alternate rows (zebra stripes for easier reading)"
          }
        />
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(2),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack gap={0.5}>
        <SectionLabel>{t?.formatDialog?.note || "NOTE"}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {t?.formatDialog?.noteDesc ||
            "Shown below the grid. Leave empty to hide."}
        </Typography>
        <TextField
          size="small"
          value={layout.note ?? ""}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder={t?.formatDialog?.notePlaceholder || "Add a note…"}
          multiline
          minRows={2}
          maxRows={6}
          sx={{ mt: 1 }}
        />
      </Stack>
    </Stack>
  );
};

LayoutTab.propTypes = {
  layout: PropTypes.object.isRequired,
  setLayout: PropTypes.func.isRequired,
};

const DIM_OPS = ["equals", "startsWith", "endsWith", "contains"];
const NUM_OPS = ["gt", "gte", "lt", "lte", "eq", "neq", "between"];

const ClauseEditor = function ClauseEditor({
  clause,
  dimensions,
  measures,
  onChange,
  onRemove,
}) {
  const { localization: t } = usePivot();
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !m.hidden),
    [measures],
  );
  const patch = (upd) => onChange({ ...clause, ...upd });
  const targetValue =
    clause.kind === "dim"
      ? `dim:${clause.target || ""}`
      : `meas:${clause.target || ""}`;

  const handleTargetChange = (e) => {
    const v = String(e.target.value || "");
    if (v.startsWith("dim:")) {
      onChange({
        ...clause,
        kind: "dim",
        target: v.slice(4),
        operator: "equals",
        value: "",
        value2: undefined,
      });
    } else {
      onChange({
        ...clause,
        kind: "measure",
        target: v.slice(5),
        operator: "gt",
        value: 0,
        value2: undefined,
      });
    }
  };

  const dimOpsLabels = {
    equals: t?.formatDialog?.exprEquals || "Equals",
    startsWith: t?.formatDialog?.exprStartsWith || "Starts with",
    endsWith: t?.formatDialog?.exprEndsWith || "Ends with",
    contains: t?.formatDialog?.exprContains || "Contains",
  };
  const numOpsLabels = {
    gt: t?.formatDialog?.operators?.gt || "> Greater than",
    gte: t?.formatDialog?.operators?.gte || "≥ Greater or equal",
    lt: t?.formatDialog?.operators?.lt || "< Less than",
    lte: t?.formatDialog?.operators?.lte || "≤ Less or equal",
    eq: t?.formatDialog?.operators?.eq || "= Equal",
    neq: t?.formatDialog?.operators?.neq || "≠ Not equal",
    between: t?.formatDialog?.operators?.between || "Between",
  };

  const ops = clause.kind === "dim" ? DIM_OPS : NUM_OPS;
  const opLabels = clause.kind === "dim" ? dimOpsLabels : numOpsLabels;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      rowGap={1.5}
      style={{ alignItems: "center" }}
      flexWrap="wrap"
    >
      <Select
        size="small"
        value={targetValue}
        onChange={handleTargetChange}
        sx={{ minWidth: 220 }}
        displayEmpty
      >
        {dimensions.length > 0 && (
          <MenuItem value="" disabled>
            <em>{t?.formatDialog?.dimensions || "Dimensions"}</em>
          </MenuItem>
        )}
        {dimensions.map((d) => (
          <MenuItem key={`dim:${d.uniqueName}`} value={`dim:${d.uniqueName}`}>
            {d.caption}
          </MenuItem>
        ))}
        {visibleMeasures.length > 0 && (
          <MenuItem value="" disabled>
            <em>{t?.fieldsList?.values || "Measures"}</em>
          </MenuItem>
        )}
        {visibleMeasures.map((m) => (
          <MenuItem key={`meas:${m.measureKey}`} value={`meas:${m.measureKey}`}>
            {m.caption || m.uniqueName}
          </MenuItem>
        ))}
      </Select>

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={!!clause.not}
            onChange={(e) => patch({ not: e.target.checked })}
          />
        }
        label={t?.formatDialog?.exprNot || "NOT"}
      />

      <Select
        size="small"
        value={clause.operator || ops[0]}
        onChange={(e) => patch({ operator: e.target.value })}
        sx={{ minWidth: 160 }}
      >
        {ops.map((op) => (
          <MenuItem key={op} value={op}>
            {opLabels[op]}
          </MenuItem>
        ))}
      </Select>

      {clause.kind === "dim" ? (
        <TextField
          size="small"
          value={clause.value ?? ""}
          onChange={(e) => patch({ value: e.target.value })}
          sx={{ width: 200 }}
          label={t?.formatDialog?.exprValue || "Value"}
        />
      ) : (
        <>
          <TextField
            size="small"
            type="number"
            value={clause.value ?? ""}
            onChange={(e) => patch({ value: Number(e.target.value) })}
            sx={{ width: 140 }}
            label={t?.formatDialog?.ruleValue || "Value"}
          />
          {clause.operator === "between" && (
            <TextField
              size="small"
              type="number"
              value={clause.value2 ?? ""}
              onChange={(e) => patch({ value2: Number(e.target.value) })}
              sx={{ width: 140 }}
              label={t?.formatDialog?.ruleValueUpperBound || "Upper bound"}
            />
          )}
        </>
      )}

      <IconButton size="small" onClick={onRemove}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
};

ClauseEditor.propTypes = {
  clause: PropTypes.object.isRequired,
  dimensions: PropTypes.array.isRequired,
  measures: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

const ExpressionDialog = function ExpressionDialog({
  open,
  onClose,
  value,
  onChange,
  dimensions,
  measures,
}) {
  const { localization: t } = usePivot();
  const portalContainer = usePortalContainer();
  const [draft, setDraft] = useState(
    () => value || { join: "and", clauses: [] },
  );

  useEffect(() => {
    if (open) setDraft(value || { join: "and", clauses: [] });
  }, [open, value]);

  const addClause = () => {
    const firstDim = dimensions[0];
    const firstMeasure = measures.find((m) => !m.hidden);
    const newClause = firstDim
      ? {
          id: `c${Date.now()}`,
          target: firstDim.uniqueName,
          kind: "dim",
          operator: "equals",
          value: "",
          not: false,
        }
      : firstMeasure
        ? {
            id: `c${Date.now()}`,
            target: firstMeasure.measureKey,
            kind: "measure",
            operator: "gt",
            value: 0,
            not: false,
          }
        : null;
    if (!newClause) return;
    setDraft({ ...draft, clauses: [...draft.clauses, newClause] });
  };

  const updateClause = (idx, next) =>
    setDraft({
      ...draft,
      clauses: draft.clauses.map((c, i) => (i === idx ? next : c)),
    });

  const removeClause = (idx) =>
    setDraft({
      ...draft,
      clauses: draft.clauses.filter((_, i) => i !== idx),
    });

  const apply = () => {
    onChange(draft);
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      container={portalContainer}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {t?.formatDialog?.expressionTitle || "Expression"}
        <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
          {t?.formatDialog?.expressionSubtitle ||
            "Combine clauses on dimensions and measures. The expression is evaluated per cell; the rule fires when it returns true."}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", top: 8, right: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ px: 3, py: 3 }}>
        <Stack gap={2.5}>
          <Stack direction="row" spacing={2} style={{ alignItems: "center" }}>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {t?.formatDialog?.expressionJoin || "Combine clauses with"}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={draft.join || "and"}
              onChange={(_, v) => v && setDraft({ ...draft, join: v })}
            >
              <ToggleButton value="and" sx={{ textTransform: "none" }}>
                {t?.formatDialog?.exprAnd || "AND"}
              </ToggleButton>
              <ToggleButton value="or" sx={{ textTransform: "none" }}>
                {t?.formatDialog?.exprOr || "OR"}
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={addClause}
            >
              {t?.formatDialog?.addClause || "Add clause"}
            </Button>
          </Stack>
          {draft.clauses.length === 0 && (
            <Box
              sx={(theme) => ({
                border: `1px dashed ${theme.palette.divider}`,
                borderRadius: 2,
                p: 3,
                textAlign: "center",
                color: theme.palette.text.secondary,
              })}
            >
              <Typography variant="body2">
                {t?.formatDialog?.noClauses || "No clauses defined."}
              </Typography>
            </Box>
          )}
          {draft.clauses.map((c, idx) => (
            <ClauseEditor
              key={c.id || idx}
              clause={c}
              dimensions={dimensions}
              measures={measures}
              onChange={(next) => updateClause(idx, next)}
              onRemove={() => removeClause(idx)}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose}>{t?.buttons?.cancel || "Cancel"}</Button>
        <Button onClick={apply} variant="contained">
          {t?.buttons?.apply || "Apply"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ExpressionDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  value: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  dimensions: PropTypes.array.isRequired,
  measures: PropTypes.array.isRequired,
};

const RuleEditor = function RuleEditor({
  rule,
  measures,
  dimensions = [],
  onChange,
  onRemove,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  const { localization: t } = usePivot();
  const patch = (upd) => onChange({ ...rule, ...upd });
  const [exprOpen, setExprOpen] = useState(false);
  const isExpression = rule.operator === "expression";
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !m.hidden),
    [measures],
  );
  // Helper: match a stored rule.measure (either measureKey or legacy
  // uniqueName) against a measures[] entry.
  const measureEntryMatches = (m, stored) => {
    if (!stored || !m) return false;
    if (stored === m.measureKey) return true;
    // Legacy: stored value was uniqueName — accept it for back-compat.
    if (!String(stored).includes(":") && stored === m.uniqueName) return true;
    return false;
  };
  const otherMeasures = useMemo(
    () => measures.filter((m) => !measureEntryMatches(m, rule.measure)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measures, rule.measure],
  );
  const measureCompareAvailable = !!rule.measure && otherMeasures.length > 0;

  const operators = useMemo(
    () => [
      {
        value: "gt",
        label: t?.formatDialog?.operators?.gt || "Greater than (>)",
      },
      {
        value: "gte",
        label: t?.formatDialog?.operators?.gte || "Greater or equal (≥)",
      },
      { value: "lt", label: t?.formatDialog?.operators?.lt || "Less than (<)" },
      {
        value: "lte",
        label: t?.formatDialog?.operators?.lte || "Less or equal (≤)",
      },
      { value: "eq", label: t?.formatDialog?.operators?.eq || "Equal (=)" },
      {
        value: "neq",
        label: t?.formatDialog?.operators?.neq || "Not equal (≠)",
      },
      {
        value: "between",
        label: t?.formatDialog?.operators?.between || "Between",
      },
      {
        value: "expression",
        label: t?.formatDialog?.operators?.expression || "Expression",
      },
    ],
    [t],
  );
  const OP_SYMBOLS = {
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    eq: "=",
    neq: "≠",
    between: "∈",
    expression: "ƒ(x)",
  };
  const measureLabel = rule.measure
    ? measures.find((m) => measureEntryMatches(m, rule.measure))?.caption ||
      rule.measure
    : t?.formatDialog?.allMeasures || "All measures";
  const opSym = OP_SYMBOLS[rule.operator || "gt"];
  const formatOperand = (kind, val, ref) => {
    if (kind === "measure") {
      if (!ref) return "?";
      const c =
        measures.find((m) => measureEntryMatches(m, ref))?.caption || ref;
      return `[${c}]`;
    }
    return `${val ?? "?"}`;
  };
  const expressionSummary = (() => {
    const n = rule.expression?.clauses?.length || 0;
    const join = (rule.expression?.join || "and").toUpperCase();
    if (n === 0) return t?.formatDialog?.noClauses || "no clauses";
    return `${n} ${
      n === 1
        ? t?.formatDialog?.clauseOne || "clause"
        : t?.formatDialog?.clauseMany || "clauses"
    } (${join})`;
  })();
  const exprRight = isExpression
    ? expressionSummary
    : rule.operator === "between"
      ? `[${formatOperand(rule.valueKind, rule.value, rule.valueRef)}, ${formatOperand(rule.value2Kind, rule.value2, rule.value2Ref)}]`
      : formatOperand(rule.valueKind, rule.value, rule.valueRef);
  const ruleTitle = `${measureLabel} ${opSym} ${exprRight}`;

  return (
    <Accordion
      disableGutters
      onDragOver={(e) => onDragOver?.(e, index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, index)}
      sx={(theme) => ({
        border: `1px solid ${
          isDropTarget ? theme.palette.primary.main : theme.palette.divider
        }`,
        borderRadius: 2,
        opacity: isDragging ? 0.4 : 1,
        "&:before": { display: "none" },
      })}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
        <Stack
          direction="row"
          style={{ alignItems: "center" }}
          spacing={1.5}
          sx={{ width: "100%" }}
        >
          <Box
            component="span"
            draggable
            onDragStart={(e) => onDragStart?.(e, index)}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
            style={{ alignItems: "center" }}
            sx={{
              display: "inline-flex",
              cursor: "grab",
              color: "text.secondary",
              "&:active": { cursor: "grabbing" },
            }}
            title="Drag to reorder"
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
          <Typography
            variant="caption"
            sx={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}
          >
            #{index + 1}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
            {ruleTitle}
          </Typography>
          <Box
            sx={(theme) => ({
              px: 1,
              py: 0.25,
              borderRadius: 0.5,
              fontSize:
                rule.style?.fontSize || theme.typography.caption.fontSize || 13,
              fontFamily: rule.style?.fontFamily || "inherit",
              fontWeight: rule.style?.fontWeight || 400,
              fontStyle: rule.style?.italic ? "italic" : "normal",
              color: rule.style?.textColor || "inherit",
              backgroundColor: rule.style?.backgroundColor || "transparent",
            })}
          >
            {t?.formatDialog?.preview || "preview"}
          </Box>
          <IconButton
            size="small"
            component="span"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2.5, py: 2.5 }}>
        <Stack direction="column" spacing={2.5}>
          <Stack
            direction="row"
            spacing={1.5}
            style={{ alignItems: "center" }}
            flexWrap="wrap"
          >
            <Select
              size="small"
              value={
                rule.measure
                  ? measures.find((m) => measureEntryMatches(m, rule.measure))
                      ?.measureKey || ""
                  : ""
              }
              onChange={(e) => {
                const nextMeasure = e.target.value || undefined;
                const upd = { measure: nextMeasure };
                const remaining = visibleMeasures.filter(
                  (m) => m.measureKey !== nextMeasure,
                );
                const canCompare = !!nextMeasure && remaining.length > 0;
                if (!canCompare) {
                  if (rule.valueKind === "measure") {
                    upd.valueKind = "constant";
                    upd.valueRef = undefined;
                  }
                  if (rule.value2Kind === "measure") {
                    upd.value2Kind = "constant";
                    upd.value2Ref = undefined;
                  }
                } else {
                  if (rule.valueRef === nextMeasure) upd.valueRef = undefined;
                  if (rule.value2Ref === nextMeasure) upd.value2Ref = undefined;
                }
                patch(upd);
              }}
              displayEmpty
              sx={{ width: 220, flexShrink: 0 }}
            >
              <MenuItem value="">
                <em>{t?.formatDialog?.allMeasures || "All measures"}</em>
              </MenuItem>
              {visibleMeasures.map((m) => (
                <MenuItem key={m.measureKey} value={m.measureKey}>
                  {m.caption || m.uniqueName}
                </MenuItem>
              ))}
            </Select>

            <Select
              size="small"
              value={rule.operator || "gt"}
              onChange={(e) => patch({ operator: e.target.value })}
              sx={{ width: 180, flexShrink: 0 }}
            >
              {operators.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>

            {!isExpression && (
              <>
                <Select
                  size="small"
                  value={rule.valueKind || "constant"}
                  onChange={(e) => patch({ valueKind: e.target.value })}
                  sx={{ width: 120, flexShrink: 0 }}
                >
                  <MenuItem value="constant">
                    {t?.formatDialog?.ruleValueConstant || "Constant"}
                  </MenuItem>
                  {measureCompareAvailable && (
                    <MenuItem value="measure">
                      {t?.formatDialog?.ruleValueMeasure || "Measure"}
                    </MenuItem>
                  )}
                </Select>

                {(rule.valueKind || "constant") === "measure" ? (
                  <Select
                    size="small"
                    value={
                      rule.valueRef
                        ? measures.find((m) =>
                            measureEntryMatches(m, rule.valueRef),
                          )?.measureKey || ""
                        : ""
                    }
                    onChange={(e) => patch({ valueRef: e.target.value })}
                    displayEmpty
                    sx={{ width: 220, flexShrink: 0 }}
                  >
                    <MenuItem value="" disabled>
                      <em>
                        {t?.formatDialog?.selectMeasure || "Select measure"}
                      </em>
                    </MenuItem>
                    {otherMeasures.map((m) => (
                      <MenuItem key={m.measureKey} value={m.measureKey}>
                        {m.caption || m.uniqueName}
                      </MenuItem>
                    ))}
                  </Select>
                ) : (
                  <TextField
                    size="small"
                    type="number"
                    value={rule.value ?? ""}
                    onChange={(e) => patch({ value: Number(e.target.value) })}
                    sx={{ width: 160, flexShrink: 0 }}
                    label={t?.formatDialog?.ruleValue || "Value"}
                  />
                )}
              </>
            )}

            {isExpression && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setExprOpen(true)}
                >
                  {t?.formatDialog?.editExpression || "Edit expression"}
                </Button>
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  {expressionSummary}
                </Typography>
              </>
            )}
          </Stack>

          {rule.operator === "between" && !isExpression && (
            <Stack direction="row" spacing={1} style={{ alignItems: "center" }}>
              <Typography
                variant="body2"
                sx={{
                  width: 408,
                  flexShrink: 0,
                  opacity: 0.75,
                  textAlign: "right",
                  pr: 1,
                }}
              >
                {t?.formatDialog?.ruleValueAnd || "and"}
              </Typography>
              <Select
                size="small"
                value={rule.value2Kind || "constant"}
                onChange={(e) => patch({ value2Kind: e.target.value })}
                sx={{ width: 120, flexShrink: 0 }}
              >
                <MenuItem value="constant">
                  {t?.formatDialog?.ruleValueConstant || "Constant"}
                </MenuItem>
                {measureCompareAvailable && (
                  <MenuItem value="measure">
                    {t?.formatDialog?.ruleValueMeasure || "Measure"}
                  </MenuItem>
                )}
              </Select>

              {(rule.value2Kind || "constant") === "measure" ? (
                <Select
                  size="small"
                  value={
                    rule.value2Ref
                      ? measures.find((m) =>
                          measureEntryMatches(m, rule.value2Ref),
                        )?.measureKey || ""
                      : ""
                  }
                  onChange={(e) => patch({ value2Ref: e.target.value })}
                  displayEmpty
                  sx={{ width: 220, flexShrink: 0 }}
                >
                  <MenuItem value="" disabled>
                    <em>
                      {t?.formatDialog?.selectMeasure || "Select measure"}
                    </em>
                  </MenuItem>
                  {otherMeasures.map((m) => (
                    <MenuItem key={m.measureKey} value={m.measureKey}>
                      {m.caption || m.uniqueName}
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                <TextField
                  size="small"
                  type="number"
                  value={rule.value2 ?? ""}
                  onChange={(e) => patch({ value2: Number(e.target.value) })}
                  sx={{ width: 160, flexShrink: 0 }}
                  label={t?.formatDialog?.ruleValueUpperBound || "Upper bound"}
                />
              )}
            </Stack>
          )}
        </Stack>

        <Stack
          direction="row"
          spacing={1.5}
          style={{ alignItems: "center" }}
          sx={{ mt: 2 }}
        >
          <SectionLabel>
            {t?.formatDialog?.conditionalModeLabel || "Evaluation mode"}
          </SectionLabel>
          <Select
            size="small"
            value={rule.mode || "inherit"}
            onChange={(e) => patch({ mode: e.target.value })}
            sx={{ width: 180, flexShrink: 0 }}
          >
            <MenuItem value="inherit">
              {t?.formatDialog?.conditionalModeInherit || "Inherit"}
            </MenuItem>
            <MenuItem value="first">
              {t?.formatDialog?.conditionalModeFirst ||
                "Stop at the first rule matched"}
            </MenuItem>
            <MenuItem value="all">
              {t?.formatDialog?.conditionalModeAll || "Evaluate all the rules"}
            </MenuItem>
          </Select>
        </Stack>

        <Divider
          sx={{
            marginTop: (theme) => theme.spacing(1),
            marginBottom: (theme) => theme.spacing(1),
          }}
        />

        <SectionEditor
          section={rule.style || {}}
          setSection={(next) => onChange({ ...rule, style: next })}
        />

        <Stack direction="row" sx={{ mt: 2 }}>
          <Box sx={{ flex: 1 }} />
          <Box
            sx={(theme) => ({
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              fontFamily: rule.style?.fontFamily || "inherit",
              fontSize:
                rule.style?.fontSize || theme.typography.caption.fontSize || 13,
              fontWeight: rule.style?.fontWeight || 400,
              fontStyle: rule.style?.italic ? "italic" : "normal",
              textAlign: rule.style?.textAlign || "left",
              color: rule.style?.textColor || "inherit",
              backgroundColor: rule.style?.backgroundColor || "transparent",
              fontVariantNumeric: "tabular-nums",
            })}
          >
            {t?.formatDialog?.preview || "preview"}
          </Box>
        </Stack>
      </AccordionDetails>
      <ExpressionDialog
        open={exprOpen}
        onClose={() => setExprOpen(false)}
        value={rule.expression}
        onChange={(next) => patch({ expression: next })}
        dimensions={dimensions}
        measures={measures}
      />
    </Accordion>
  );
};

RuleEditor.propTypes = {
  rule: PropTypes.object.isRequired,
  measures: PropTypes.array.isRequired,
  dimensions: PropTypes.array,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  index: PropTypes.number.isRequired,
  isDragging: PropTypes.bool,
  isDropTarget: PropTypes.bool,
  onDragStart: PropTypes.func,
  onDragOver: PropTypes.func,
  onDragLeave: PropTypes.func,
  onDrop: PropTypes.func,
  onDragEnd: PropTypes.func,
};

const ConditionalTab = function ConditionalTab({
  rules,
  setRules,
  measures,
  dimensions = [],
  mode,
  setMode,
}) {
  const { localization: t } = usePivot();
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  const handleDragStart = (e, idx) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", String(idx));
    } catch {
      // some browsers require data to be set
    }
  };
  const handleDragOver = (e, idx) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (idx !== dropIndex) setDropIndex(idx);
  };
  const handleDragLeave = () => {
    // no-op; dropIndex is updated on next dragOver
  };
  const handleDrop = (e, idx) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const next = [...rules];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setRules(next);
    setDragIndex(null);
    setDropIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const addRule = () => {
    setRules([
      ...rules,
      {
        id: `r${Date.now()}`,
        measure: undefined,
        operator: "gt",
        value: 0,
        style: { ...DEFAULT_RULE_STYLE },
      },
    ]);
  };

  const updateRule = (idx, next) =>
    setRules(rules.map((r, i) => (i === idx ? next : r)));

  const removeRule = (idx) => setRules(rules.filter((_, i) => i !== idx));

  const effectiveMode = mode === "all" ? "all" : "first";
  const modeDescription =
    effectiveMode === "all"
      ? t?.formatDialog?.conditionalModeAllDesc ||
        "Rules are evaluated from top to bottom; every matching rule is applied — later rules override earlier ones for the properties they set."
      : t?.formatDialog?.conditionalModeFirstDesc ||
        "Rules are evaluated from top to bottom; the first matching rule is applied.";

  return (
    <Stack gap={3} sx={{ pt: 1.5 }}>
      <Stack gap={0.75}>
        <SectionLabel>
          {t?.formatDialog?.conditionalModeLabel || "Evaluation mode"}
        </SectionLabel>
        <Select
          size="small"
          value={effectiveMode}
          onChange={(e) => setMode?.(e.target.value)}
        >
          <MenuItem value="first">
            {t?.formatDialog?.conditionalModeFirst ||
              "Stop at the first rule matched"}
          </MenuItem>
          <MenuItem value="all">
            {t?.formatDialog?.conditionalModeAll || "Evaluate all the rules"}
          </MenuItem>
        </Select>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {modeDescription}
        </Typography>
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(1),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack
        direction="row"
        sx={{ marginBottom: (theme) => theme.spacing(1) }}
        style={{ alignItems: "center" }}
      >
        <Typography variant="caption" sx={{ opacity: 0.75, flex: 1 }}>
          {t?.formatDialog?.rulesDesc || "Drag to reorder rules."}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addRule}
          variant="outlined"
        >
          {t?.formatDialog?.addRule || "Add rule"}
        </Button>
      </Stack>
      {rules.length === 0 && (
        <Box
          sx={(theme) => ({
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: theme.borderRadius,
            p: 3,
            textAlign: "center",
            color: theme.palette.text.secondary,
            marginTop: theme.spacing(1),
          })}
        >
          <Typography variant="body2">
            {t?.formatDialog?.noRules || "No rules defined."}
          </Typography>
        </Box>
      )}
      {rules.map((r, idx) => (
        <RuleEditor
          key={r.id || idx}
          rule={r}
          index={idx}
          measures={measures}
          dimensions={dimensions}
          onChange={(next) => updateRule(idx, next)}
          onRemove={() => removeRule(idx)}
          isDragging={dragIndex === idx}
          isDropTarget={
            dropIndex === idx && dragIndex !== null && dragIndex !== idx
          }
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      ))}
    </Stack>
  );
};

ConditionalTab.propTypes = {
  rules: PropTypes.array.isRequired,
  setRules: PropTypes.func.isRequired,
  measures: PropTypes.array.isRequired,
  dimensions: PropTypes.array,
  mode: PropTypes.string,
  setMode: PropTypes.func,
};

const DEFAULTS = {
  values: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 400,
    italic: false,
    textColor: null,
    backgroundColor: null,
    textAlign: "right",
    thousandSeparator: "System",
    decimalSeparator: "System",
    numberOfDecimals: "Default",
    currencySymbol: "None",
    currencyOther: "",
    currencyAlignment: "Left",
    nullValue: "",
    percentage: false,
  },
  headers: {
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 700,
    italic: false,
    textColor: null,
    backgroundColor: null,
    textAlign: "left",
  },
  grandTotals: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 700,
    italic: false,
    textColor: null,
    backgroundColor: null,
    textAlign: "left",
  },
  dimensions: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    italic: false,
    textColor: null,
    backgroundColor: null,
    textAlign: "left",
  },
  layout: {
    totalsRowsPosition: "before",
    totalsColumnsPosition: "before",
    alternateRows: false,
    density: "Standard",
    title: "",
    note: "",
  },
};

const FormatDialog = function FormatDialog({ open, onClose }) {
  const { engine, localization: t } = usePivot();
  const portalContainer = usePortalContainer();
  const [tab, setTab] = useState(0);
  const [values, setValues] = useState(() => engine.getFormat().values);
  const [headers, setHeaders] = useState(() => engine.getFormat().headers);
  const [grandTotals, setGrandTotals] = useState(
    () => engine.getFormat().grandTotals || { ...DEFAULTS.grandTotals },
  );
  const [dimensions, setDimensions] = useState(
    () => engine.getFormat().dimensions,
  );
  const [layout, setLayout] = useState(
    () => engine.getFormat().layout || { ...DEFAULTS.layout },
  );
  const [rules, setRules] = useState(() => engine.getFormat().conditional);
  const [conditionalMode, setConditionalMode] = useState(
    () => engine.getFormat().conditionalMode || "first",
  );
  const [valuesByMeasure, setValuesByMeasure] = useState(
    () => engine.getFormat().valuesByMeasure || {},
  );
  const [valuesTarget, setValuesTarget] = useState("__default__");

  useEffect(() => {
    if (!open) return;
    const current = engine.getFormat();
    setValues(current.values);
    setHeaders(current.headers);
    setGrandTotals(current.grandTotals || { ...DEFAULTS.grandTotals });
    setDimensions(current.dimensions);
    setLayout(current.layout || { ...DEFAULTS.layout });
    setRules(current.conditional);
    setConditionalMode(current.conditionalMode || "first");
    setValuesByMeasure(current.valuesByMeasure || {});
    setValuesTarget("__default__");
  }, [open, engine]);

  const calcByName = new Map(
    (engine.getCalculatedFields?.() || []).map((f) => [f.uniqueName, f]),
  );
  // Build one measure option per slice entry so every dropdown exposes the
  // specific aggregation (e.g. "Call Answer Type (Sum)" and
  // "Call Answer Type (Avg)" show as two separate items). Selections carry
  // the full measureKey (`uniqueName:aggregation`) so per-measure overrides
  // and conditional rules can target a single aggregation.
  const aggLabel = (a) => {
    const wdrKey = { distinctcount: "distinctCount", avg: "average" }[a] || a;
    const raw = t?.aggregations?.[a] ?? t?.aggregations?.[wdrKey];
    if (raw && typeof raw === "object") return raw.caption || a;
    return raw || a;
  };
  const measures = (engine.getSlice().measures || []).map((m) => ({
    uniqueName: m.uniqueName,
    aggregation: m.aggregation,
    measureKey: `${m.uniqueName}:${m.aggregation}`,
    caption: (() => {
      const base =
        engine.getMetadata()[m.uniqueName]?.caption ||
        calcByName.get(m.uniqueName)?.caption ||
        m.uniqueName;
      return `${base} (${aggLabel(m.aggregation)})`;
    })(),
    hidden: !!m.hidden,
  }));

  const dimensionFields = (() => {
    const slice = engine.getSlice();
    const meta = engine.getMetadata();
    const seen = new Set();
    const out = [];
    [...(slice.rows || []), ...(slice.columns || [])].forEach((f) => {
      if (!f || f.uniqueName === "Measures") return;
      if (seen.has(f.uniqueName)) return;
      seen.add(f.uniqueName);
      out.push({
        uniqueName: f.uniqueName,
        caption: meta[f.uniqueName]?.caption || f.uniqueName,
      });
    });
    return out;
  })();

  const handleApply = () => {
    engine.setFormat({
      values,
      valuesByMeasure,
      headers,
      grandTotals,
      dimensions,
      layout,
      conditional: rules,
      conditionalMode,
    });
    onClose?.();
  };

  const handleReset = () => {
    engine.setFormat({
      values: { ...DEFAULTS.values },
      valuesByMeasure: {},
      headers: { ...DEFAULTS.headers },
      grandTotals: { ...DEFAULTS.grandTotals },
      dimensions: { ...DEFAULTS.dimensions },
      layout: { ...DEFAULTS.layout },
      conditional: [],
      conditionalMode: "first",
    });
    onClose?.();
  };

  const activeValuesSection =
    valuesTarget === "__default__"
      ? values
      : { ...values, ...(valuesByMeasure[valuesTarget] || {}) };

  const setActiveValuesSection = (next) => {
    if (valuesTarget === "__default__") {
      setValues(next);
    } else {
      setValuesByMeasure({ ...valuesByMeasure, [valuesTarget]: next });
    }
  };

  const clearMeasureOverride = () => {
    if (valuesTarget === "__default__") return;
    const rest = { ...valuesByMeasure };
    delete rest[valuesTarget];
    setValuesByMeasure(rest);
  };

  const hasMeasureOverride =
    valuesTarget !== "__default__" && !!valuesByMeasure[valuesTarget];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      container={portalContainer}
    >
      <DialogTitle sx={{ pr: 6, pt: 2.5, pb: 2 }}>
        {t?.toolbar?.format || "Format"}
        <Typography
          variant="caption"
          component="div"
          sx={{ opacity: 0.7, mt: 0.5 }}
        >
          {t?.formatDialog?.subtitle ||
            "Customize cell display and conditional formatting rules."}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={(theme) => ({
          borderBottom: `1px solid ${theme.palette.divider}`,
          px: 3,
          "& .MuiTab-root": { textTransform: "none", minHeight: 44 },
        })}
      >
        <Tab label={t?.formatDialog?.tabs?.layout || "Layout"} />
        <Tab label={t?.formatDialog?.tabs?.headers || "Headers"} />
        <Tab label={t?.formatDialog?.tabs?.dimensions || "Dimensions"} />
        <Tab label={t?.formatDialog?.tabs?.values || "Values"} />
        <Tab label={t?.formatDialog?.tabs?.conditional || "Conditional"} />
        <Tab label={t?.formatDialog?.tabs?.grandTotals || "Grand totals"} />
      </Tabs>
      <DialogContent sx={{ px: 3, py: 3 }}>
        {tab === 0 && <LayoutTab layout={layout} setLayout={setLayout} />}
        {tab === 1 && (
          <SectionEditor section={headers} setSection={setHeaders} />
        )}
        {tab === 2 && (
          <SectionEditor section={dimensions} setSection={setDimensions} />
        )}
        {tab === 3 && (
          <Stack gap={3}>
            <Stack direction="row" spacing={2} style={{ alignItems: "center" }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {t?.formatDialog?.valuesTarget || "Apply to"}
              </Typography>
              <Select
                size="small"
                value={valuesTarget}
                onChange={(e) => setValuesTarget(e.target.value)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="__default__">
                  <em>
                    {t?.formatDialog?.valuesDefault || "Default (all measures)"}
                  </em>
                </MenuItem>
                {measures.map((m) => (
                  <MenuItem key={m.measureKey} value={m.measureKey}>
                    {valuesByMeasure[m.measureKey] ? "● " : ""}
                    {m.caption || m.uniqueName}
                  </MenuItem>
                ))}
              </Select>
              {hasMeasureOverride && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={clearMeasureOverride}
                >
                  {t?.formatDialog?.clearOverride || "Use default"}
                </Button>
              )}
            </Stack>
            <Divider
              sx={{
                marginTop: (theme) => theme.spacing(1),
                marginBottom: (theme) => theme.spacing(1),
              }}
            />
            <SectionEditor
              key={valuesTarget}
              section={activeValuesSection}
              setSection={setActiveValuesSection}
              showNumberFormat
            />
          </Stack>
        )}
        {tab === 4 && (
          <ConditionalTab
            rules={rules}
            setRules={setRules}
            measures={measures}
            dimensions={dimensionFields}
            mode={conditionalMode}
            setMode={setConditionalMode}
          />
        )}
        {tab === 5 && (
          <Stack gap={3}>
            <TotalsPositionEditor layout={layout} setLayout={setLayout} />
            <Divider
              sx={{
                marginTop: (theme) => theme.spacing(1),
                marginBottom: (theme) => theme.spacing(1),
              }}
            />
            <SectionEditor
              section={grandTotals}
              setSection={setGrandTotals}
              showAlignment={false}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={handleReset} color="inherit">
          {t?.buttons?.reset || "Reset"}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t?.buttons?.cancel || "Cancel"}</Button>
        <Button onClick={handleApply} variant="contained">
          {t?.buttons?.apply || "Apply"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

FormatDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default FormatDialog;
