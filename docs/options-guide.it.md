# AuraPivot — guida alla prop `options`

`<AuraPivot>` si configura con tre prop:

| Prop | Tipo | Scopo |
|---|---|---|
| `dataSource` | `Array<object>` | I dati — un array di oggetti riga. |
| `options` | `object` | La configurazione completa (vedi sotto). |
| `onOptionsChange` | `(nextOptions) => void` | Invocata dopo ogni modifica interna. |

`options` e `dataSource` sono separati di proposito: `dataSource` sono le
righe, `options.data.fields` è lo schema di quelle righe.

## Modello di applicazione — seed-on-change

`options` viene riapplicata alla tabella **solo quando cambia il riferimento
dell'oggetto**. Ri-renderizzare con lo stesso oggetto `options` conserva le
modifiche fatte dall'utente dentro la tabella. Per imporre una nuova
configurazione, passare un nuovo oggetto.

```jsx
const [options, setOptions] = useState(initialOptions);

<AuraPivot
  dataSource={rows}
  options={options}
  onOptionsChange={setOptions}
/>;
```

Rimettere il valore di `onOptionsChange` dentro `options` è sicuro: il
componente riconosce l'oggetto che ha emesso e non lo riapplica.

## Schema

### `toolbar`

| Chiave | Tipo | Default | Significato |
|---|---|---|---|
| `visible` | boolean | `true` | Accende/spegne l'intera toolbar. |
| `showFields` | boolean | `true` | Mostra la scheda Campi. |
| `showFormat` | boolean | `true` | Mostra la scheda Formato. |
| `showExport` | boolean | `true` | Mostra la scheda Esporta. |
| `showFullscreen` | boolean | `true` | Mostra il pulsante Schermo intero. |

### `layout`

| Chiave | Tipo | Valori / Default | Significato |
|---|---|---|---|
| `showTitle` | boolean | `true` | Mostra la barra del titolo. |
| `title` | string | `""` | Testo del titolo. |
| `notes` | string | `""` | Testo della nota a piè di tabella. |
| `density` | string | `Compact` \| `Standard` \| `Comfortable` | Altezza riga. |
| `alternateRows` | boolean | `false` | Righe a zebra. |
| `enableDrillThrough` | boolean | `true` | Abilita il drill-through sulle celle. |
| `drillThroughStickyColumns` | intero ≥ 0 | `2` | Colonne bloccate a sinistra nel drill-through. |
| `totalsRowsPosition` | string | `before` \| `after` \| `none` | Posizione delle righe totali. |
| `totalsRowsSticky` | boolean | `false` | Fissa le righe totali allo scroll. |
| `totalsColumnsPosition` | string | `before` \| `after` \| `none` | Posizione delle colonne totali. |
| `totalsColumnsSticky` | boolean | `false` | Fissa le colonne totali allo scroll. |
| `measuresAxis` | string | `rows` \| `columns` | Asse su cui stanno le misure. |

### `data.fields` — lo schema del dataset

Una voce per ogni colonna sorgente.

| Chiave | Tipo | Significato |
|---|---|---|
| `fieldName` | string | Nome originale della colonna in `dataSource`. |
| `uniqueName` | string (obbligatorio) | Identificatore usato da dimensioni/misure/filtri. |
| `dataType` | `number` \| `string` \| `date` \| `time` \| `month` | Tipo della colonna. |
| `caption` | string | Etichetta visualizzata. |
| `showInDrillThrough` | boolean | Includi il campo nella tabella di drill-through. |
| `drillThroughOrder` | number | Posizione del campo (anche ordine colonne drill-through). |
| `dateFormat` | string \| null | Token di formato data (solo campi data). |

### `data.calculatedFields`

| Chiave | Tipo | Significato |
|---|---|---|
| `uniqueName` | string (obbligatorio) | Identificatore. |
| `caption` | string | Etichetta visualizzata. |
| `formula` | string (obbligatorio) | Formula, es. `IF(callCount == 0, null, answeredCallCount/callCount)`. |

### `data.dimensions`

| Chiave | Tipo | Significato |
|---|---|---|
| `axis` | `row` \| `column` (obbligatorio) | Asse della dimensione. |
| `uniqueName` | string (obbligatorio) | Identificatore del campo. |
| `fieldSort` | object \| null | Descrittore di ordinamento dei membri. |

### `data.measures`

| Chiave | Tipo | Significato |
|---|---|---|
| `uniqueName` | string (obbligatorio) | Identificatore del campo o campo calcolato. |
| `aggregation` | `sum` \| `count` \| `distinctcount` \| `avg` \| `min` \| `max` \| `formula` | Aggregazione. Usa `formula` per i campi calcolati. |
| `hidden` | boolean | Nascondi la misura dalla griglia. |

### `data.filters`

Una voce per ogni campo filtrato. Fornire **esattamente uno** tra `members`,
`value`, `range`.

| Chiave | Tipo | Significato |
|---|---|---|
| `uniqueName` | string (obbligatorio) | Identificatore del campo. |
| `members` | array | Mantieni solo questi valori. |
| `value` | any | Mantieni solo questo singolo valore. |
| `range` | `{ min, max }` | Mantieni i valori nell'intervallo. |

### `format`

| Chiave | Tipo | Significato |
|---|---|---|
| `conditionalMode` | `first` \| `all` | Applica la prima regola che corrisponde, o tutte. |
| `conditional` | array | Regole di formattazione condizionale (sotto). |
| `values` | object | Font / numeri / colori delle celle numeriche. |
| `valuesByMeasure` | object | Override per misura, chiave `"<uniqueName>:<aggregation>"`. |
| `headers` | object | Stile delle intestazioni di colonna. |
| `dimensions` | object | Stile delle etichette di riga. |
| `grandTotals` | object | Stile dei totali generali. |

Una regola `conditional`:

| Chiave | Tipo | Significato |
|---|---|---|
| `id` | string | Id stabile della regola. |
| `measure` | string | Misura bersaglio `"<uniqueName>:<aggregation>"`. |
| `operator` | `eq` \| `ne` \| `gt` \| `gte` \| `lt` \| `lte` \| `between` | Confronto. |
| `value` | number | Valore di confronto. |
| `value2` | number | Estremo superiore — **obbligatorio** con `operator` `between`. |
| `style` | object | `{ textColor, backgroundColor, fontWeight, italic }`. I colori sono `#RRGGBB` o `null`. |

## Leggere le modifiche dall'esterno

```jsx
function handleChange(next) {
  // `next` è l'oggetto options completo e aggiornato.
  saveToServer(next);
  setOptions(next);
}

<AuraPivot dataSource={rows} options={options} onOptionsChange={handleChange} />;
```

`ref.auraPivot.getOptions()` restituisce lo schema corrente su richiesta.
