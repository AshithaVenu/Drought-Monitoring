
/***************************************************************
 VEGETATION CONDITION INDEX (VCI) — INDONESIA
 Dataset: MODIS/061/MOD13A2
 Target period: 1 January – 25 October 2026
 Historical baseline: same period, 2001–2025
 Boundary: USDOS/LSIB_SIMPLE/2017

 VCI = 100 * (NDVI_current - NDVI_min) /
              (NDVI_max - NDVI_min)

 Current NDVI is the mean for the target period.
 Historical minimum and maximum are calculated pixelwise
 from annual mean NDVI images for the same seasonal window.
***************************************************************/

// 1. SETTINGS
var startDate = '2026-01-01';
var endDate = '2026-10-26'; // Exclusive; includes October 25

var baselineStartYear = 2001;
var baselineEndYear = 2025;

var scale = 1000;

// 2. INDONESIA BOUNDARY
var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

var indonesia = countries
  .filter(ee.Filter.eq('country_na', 'Indonesia'));

var roi = indonesia.geometry();

Map.centerObject(indonesia, 5);

Map.addLayer(
  indonesia.style({
    color: 'FFFFFF',
    fillColor: '00000000',
    width: 1
  }),
  {},
  'Indonesia boundary'
);

print('Indonesia boundary features:', indonesia.size());

// 3. MODIS NDVI DATA
var modis = ee.ImageCollection('MODIS/061/MOD13A2')
  .filterBounds(roi);

// Apply QA screening and scale NDVI to its physical values.
function prepareNDVI(image) {
  var qa = image.select('SummaryQA');

  // Keep good and marginal-quality observations.
  var goodQuality = qa.lte(1);

  var ndvi = image.select('NDVI')
    .multiply(0.0001)
    .rename('NDVI')
    .updateMask(goodQuality);

  return ndvi.copyProperties(image, ['system:time_start']);
}

// 4. TARGET-PERIOD NDVI
var targetCollection = modis
  .filterDate(startDate, endDate)
  .map(prepareNDVI);

print('Target-period MODIS image count:', targetCollection.size());

print(
  'Latest available target-period observation:',
  ee.Date(
    ee.Image(targetCollection.sort('system:time_start', false).first())
      .get('system:time_start')
  )
);

var currentNDVI = targetCollection
  .mean()
  .rename('NDVI_current')
  .clip(roi)
  .toFloat();

// 5. HISTORICAL ANNUAL MEAN NDVI
// Each baseline image represents the mean NDVI for the same
// January 1–October 25 period in one year.

var years = ee.List.sequence(
  baselineStartYear,
  baselineEndYear
);

var historicalAnnualNDVI = ee.ImageCollection.fromImages(
  years.map(function(year) {
    year = ee.Number(year);

    var yearStart = ee.Date.fromYMD(year, 1, 1);
    var yearEnd = ee.Date.fromYMD(year, 10, 26);

    var annualCollection = modis
      .filterDate(yearStart, yearEnd)
      .map(prepareNDVI);

    var annualMean = annualCollection
      .mean()
      .rename('NDVI')
      .toFloat();

    return annualMean
      .set('year', year)
      .set(
        'system:time_start',
        yearStart.millis()
      );
  })
);

print(
  'Historical annual image count:',
  historicalAnnualNDVI.size()
);

print(
  'Example historical annual image:',
  historicalAnnualNDVI.first()
);

// 6. PIXELWISE HISTORICAL MINIMUM AND MAXIMUM NDVI
var ndviMin = historicalAnnualNDVI
  .min()
  .rename('NDVI_min')
  .toFloat()
  .clip(roi);

var ndviMax = historicalAnnualNDVI
  .max()
  .rename('NDVI_max')
  .toFloat()
  .clip(roi);

// Historical NDVI range
var ndviRange = ndviMax
  .subtract(ndviMin)
  .rename('NDVI_range');

// 7. CALCULATE VCI
// Mask pixels where historical NDVI has no valid range.
var validRange = ndviRange.gt(0);

var vci = currentNDVI
  .subtract(ndviMin)
  .divide(ndviRange)
  .multiply(100)
  .rename('VCI')
  .updateMask(validRange)
  .clip(roi)
  .toFloat();

// Keep VCI values outside 0–100 if 2026 falls outside
// the historical extrema. The map display is set to 0–100.
print('VCI image:', vci);
print('VCI band names:', vci.bandNames());

// 8. VISUALIZATION — TEN DISTINCT COLORS
var vciPalette = [
  'A50026', // 0–10: very low
  'D73027', // 10–20
  'F46D43', // 20–30
  'FDAE61', // 30–40
  'FEE08B', // 40–50
  'D9EF8B', // 50–60
  'A6D96A', // 60–70
  '66BD63', // 70–80
  '1A9850', // 80–90
  '006837'  // 90–100: very high
];

var vciVis = {
  min: 0,
  max: 100,
  palette: vciPalette
};

Map.addLayer(
  vci,
  vciVis,
  'VCI Indonesia — Jan–Oct 2026'
);

// Optional: inspect current NDVI and historical extrema.
Map.addLayer(
  currentNDVI,
  {
    min: 0,
    max: 0.9,
    palette: ['FFFFFF', 'D9EF8B', '66BD63', '006837']
  },
  'Mean NDVI 2026',
  false
);

Map.addLayer(
  ndviMin,
  {
    min: 0,
    max: 0.9,
    palette: ['FFFFFF', 'FEE08B', 'D73027']
  },
  'Historical minimum NDVI',
  false
);

Map.addLayer(
  ndviMax,
  {
    min: 0,
    max: 0.9,
    palette: ['FFFFFF', 'A6D96A', '006837']
  },
  'Historical maximum NDVI',
  false
);

// 9. LEGEND
/*var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 12px'
  }
});

legend.add(ui.Label({
  value: 'VCI — Vegetation Condition Index',
  style: {fontWeight: 'bold', fontSize: '13px'}
}));

legend.add(ui.Label('Lower VCI = greater vegetation stress'));

for (var i = 0; i < 10; i++) {
  var lower = i * 10;
  var upper = (i + 1) * 10;

  var colorBox = ui.Label('', {
    backgroundColor: '#' + vciPalette[i],
    padding: '8px',
    margin: '0 6px 4px 0'
  });

  var rangeLabel = ui.Label(
    lower + '–' + upper,
    {margin: '0 0 4px 0'}
  );

  legend.add(ui.Panel(
    [colorBox, rangeLabel],
    ui.Panel.Layout.Flow('horizontal')
  ));
}

legend.add(ui.Label('Higher VCI = healthier vegetation'));

Map.add(legend);

*/




// 10. SUMMARY STATISTICS
var stats = vci.reduceRegion({
  reducer: ee.Reducer.minMax()
    .combine({
      reducer2: ee.Reducer.mean(),
      sharedInputs: true
    })
    .combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
  geometry: roi,
  scale: scale,
  maxPixels: 1e13,
  tileScale: 8
});

print('VCI summary statistics:', stats);






// 11. OPTIONAL EXPORT TO GOOGLE DRIVE
Export.image.toDrive({
  image: vci,
  description: 'Indonesia_VCI_Jan_Oct_2026',
  folder: 'GEE_Drought_Indices',
  fileNamePrefix: 'Indonesia_VCI_2026',
  region: roi,
  scale: scale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


/***************************************************************
 TEMPERATURE CONDITION INDEX (TCI) — INDONESIA
 Dataset: MODIS/061/MOD11A1
 Target period: 1 Jan – 25 Oct 2026
 Historical baseline: same period, 2001–2025
 Boundary: USDOS/LSIB_SIMPLE/2017

 TCI = 100 * (LST_max - LST_current) /
              (LST_max - LST_min)

 Uses daytime LST and good-quality QC observations.
***************************************************************/

// 1. SETTINGS
var startDate = '2026-01-01';
var endDate = '2026-10-26'; // End is exclusive; includes Oct 25

var baselineStartYear = 2001;
var baselineEndYear = 2025;
var scale = 1000;

// 2. INDONESIA BOUNDARY
var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

var indonesia = countries.filter(
  ee.Filter.eq('country_na', 'Indonesia')
);

var roi = indonesia.geometry();

Map.centerObject(indonesia, 5);

Map.addLayer(
  indonesia.style({
    color: 'FFFFFF',
    fillColor: '00000000',
    width: 1
  }),
  {},
  'Indonesia boundary'
);

print('Indonesia feature count:', indonesia.size());

// 3. LOAD MODIS DAILY LST
var modis = ee.ImageCollection('MODIS/061/MOD11A1')
  .filterBounds(roi);

// Keep only good mandatory QA (bits 0–1 = 0)
// and good LST data quality (bits 2–3 = 0).
// Apply scale factor 0.02 K, then convert to Celsius.
function prepareLST(image) {
  var qc = image.select('QC_Day');

  var mandatoryQA = qc.bitwiseAnd(3).eq(0);
  var dataQuality = qc.rightShift(2).bitwiseAnd(3).eq(0);

  var valid = mandatoryQA.and(dataQuality);

  var lstC = image.select('LST_Day_1km')
    .multiply(0.02)
    .subtract(273.15)
    .rename('LST')
    .updateMask(valid)
    .toFloat();

  return lstC.copyProperties(image, ['system:time_start']);
}

// 4. TARGET PERIOD MEAN LST
var targetCollection = modis
  .filterDate(startDate, endDate)
  .map(prepareLST);

print('Target-period image count:', targetCollection.size());

var latestTarget = ee.Image(
  targetCollection.sort('system:time_start', false).first()
);

print(
  'Latest target-period observation date:',
  ee.Date(latestTarget.get('system:time_start')).format('YYYY-MM-dd')
);

var currentLST = targetCollection
  .mean()
  .rename('LST_current')
  .toFloat()
  .clip(roi);

// 5. HISTORICAL ANNUAL MEAN LST
// One image per year, using Jan 1 through Oct 25.
// These annual means form the historical reference.

var years = ee.List.sequence(
  baselineStartYear,
  baselineEndYear
);

var historicalAnnualLST = ee.ImageCollection.fromImages(
  years.map(function(year) {
    year = ee.Number(year);

    var yearStart = ee.Date.fromYMD(year, 1, 1);
    var yearEnd = ee.Date.fromYMD(year, 10, 26);

    var annualCollection = modis
      .filterDate(yearStart, yearEnd)
      .map(prepareLST);

    // Float type keeps all annual images homogeneous.
    var annualMean = annualCollection
      .mean()
      .rename('LST')
      .toFloat();

    return annualMean.set({
      'year': year,
      'system:time_start': yearStart.millis()
    });
  })
);

print('Historical annual image count:', historicalAnnualLST.size());
print('Example historical image:', historicalAnnualLST.first());

// 6. HISTORICAL MINIMUM AND MAXIMUM LST
var lstMin = historicalAnnualLST
  .min()
  .rename('LST_min')
  .toFloat()
  .clip(roi);

var lstMax = historicalAnnualLST
  .max()
  .rename('LST_max')
  .toFloat()
  .clip(roi);

var lstRange = lstMax.subtract(lstMin).rename('LST_range');

// Avoid division by zero where the historical range is absent.
var validRange = lstRange.gt(0);

// 7. CALCULATE TCI
var tci = lstMax
  .subtract(currentLST)
  .divide(lstRange)
  .multiply(100)
  .rename('TCI')
  .updateMask(validRange)
  .clip(roi)
  .toFloat();

print('TCI image:', tci);
print('TCI band names:', tci.bandNames());

// 8. TEN-CLASS COLOR PALETTE
// Red = low TCI / hotter relative surface conditions.
// Blue = high TCI / cooler relative surface conditions.
var tciPalette = [
  '67001F', // 0–10
  'B2182B', // 10–20
  'D6604D', // 20–30
  'F4A582', // 30–40
  'FDDBC7', // 40–50
  'D1E5F0', // 50–60
  '92C5DE', // 60–70
  '4393C3', // 70–80
  '2166AC', // 80–90
  '053061'  // 90–100
];

var tciVis = {
  min: 0,
  max: 100,
  palette: tciPalette
};

Map.addLayer(
  tci,
  tciVis,
  'TCI Indonesia — Jan–Oct 2026'
);

// Optional diagnostic layers
Map.addLayer(
  currentLST,
  {
    min: 15,
    max: 40,
    palette: ['313695', '74ADD1', 'FFFFBF', 'F46D43', 'A50026']
  },
  'Mean daytime LST (°C)',
  false
);

Map.addLayer(
  lstMin,
  {
    min: 15,
    max: 35,
    palette: ['313695', 'FFFFBF', 'A50026']
  },
  'Historical minimum annual mean LST (°C)',
  false
);

Map.addLayer(
  lstMax,
  {
    min: 20,
    max: 45,
    palette: ['313695', 'FFFFBF', 'A50026']
  },
  'Historical maximum annual mean LST (°C)',
  false
);

// 9. MAP LEGEND
/*var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 12px'
  }
});

legend.add(ui.Label({
  value: 'Temperature Condition Index (TCI)',
  style: {fontWeight: 'bold', fontSize: '13px'}
}));

legend.add(ui.Label('Lower TCI: hotter relative conditions'));

for (var i = 0; i < 10; i++) {
  var colorBox = ui.Label('', {
    backgroundColor: '#' + tciPalette[i],
    padding: '8px',
    margin: '0 6px 4px 0'
  });

  var label = ui.Label(
    (i * 10) + '–' + ((i + 1) * 10),
    {margin: '0 0 4px 0'}
  );

  legend.add(ui.Panel(
    [colorBox, label],
    ui.Panel.Layout.Flow('horizontal')
  ));
}

legend.add(ui.Label('Higher TCI: cooler relative conditions'));

Map.add(legend);

*/




// 10. SUMMARY STATISTICS
var stats = tci.reduceRegion({
  reducer: ee.Reducer.minMax()
    .combine({
      reducer2: ee.Reducer.mean(),
      sharedInputs: true
    })
    .combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
  geometry: roi,
  scale: scale,
  maxPixels: 1e13,
  tileScale: 8
});

print('TCI summary statistics:', stats);

// 11. OPTIONAL EXPORT TO GOOGLE DRIVE
Export.image.toDrive({
  image: tci,
  description: 'Indonesia_TCI_Jan_Oct_2026',
  folder: 'GEE_Drought_Indices',
  fileNamePrefix: 'Indonesia_TCI_2026',
  region: roi,
  scale: 1000,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});






/***************************************************************
 DROUGHT SEVERITY INDEX (DSI-STYLE) — INDONESIA
 NDVI: MODIS/061/MOD13A2 (16-day, 1 km)
 ET/PET: MODIS/061/MOD16A2 (8-day, 500 m)
 Boundary: USDOS/LSIB_SIMPLE/2017

 Target: 1 Jan – 25 Oct 2026
 Baseline: matching seasonal period, 2001–2025

 DSI = -0.5 * (Z_NDVI + Z_ET_PET)

 Positive DSI = drier-than-usual conditions
 Negative DSI = wetter-than-usual conditions
***************************************************************/

// ============================================================
// 1. SETTINGS
// ============================================================

var startDate = '2026-01-01';
var endDate = '2026-10-26'; // Exclusive end date

var baselineStartYear = 2001;
var baselineEndYear = 2025;

var analysisScale = 1000;

// ============================================================
// 2. INDONESIA BOUNDARY
// ============================================================

var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

var indonesia = countries.filter(
  ee.Filter.eq('country_na', 'Indonesia')
);

var roi = indonesia.geometry();

Map.centerObject(indonesia, 5);

Map.addLayer(
  indonesia.style({
    color: 'FFFFFF',
    fillColor: '00000000',
    width: 1
  }),
  {},
  'Indonesia boundary'
);

print('Indonesia feature count:', indonesia.size());

// ============================================================
// 3. LOAD DATASETS
// ============================================================

var ndviDataset = ee.ImageCollection('MODIS/061/MOD13A2')
  .filterBounds(roi);

var etDataset = ee.ImageCollection('MODIS/061/MOD16A2')
  .filterBounds(roi);

print('NDVI dataset ID:', 'MODIS/061/MOD13A2');
print('ET/PET dataset ID:', 'MODIS/061/MOD16A2');

// ============================================================
// 4. PREPARE NDVI
// ============================================================

function prepareNDVI(image) {
  var qa = image.select('SummaryQA');

  // Retain good and marginal-quality NDVI observations.
  var mask = qa.lte(1);

  var ndvi = image.select('NDVI')
    .multiply(0.0001)
    .rename('NDVI')
    .updateMask(mask)
    .toFloat();

  return ndvi.copyProperties(image, ['system:time_start']);
}

// ============================================================
// 5. PREPARE ET AND PET
// ============================================================

function prepareET(image) {
  var qc = image.select('ET_QC');

  // ET_QC bit 0: MODLAND quality.
  // 0 = good quality; 1 = other quality.
  var goodQuality = qc.bitwiseAnd(1).eq(0);

  var et = image.select('ET')
    .multiply(0.1)
    .rename('ET')
    .updateMask(goodQuality)
    .toFloat();

  var pet = image.select('PET')
    .multiply(0.1)
    .rename('PET')
    .updateMask(goodQuality)
    .toFloat();

  return et.addBands(pet)
    .copyProperties(image, ['system:time_start']);
}

// ============================================================
// 6. FLOAT-TYPED MASKED FALLBACK IMAGES
// ============================================================

var emptyMask = ee.Image.constant(0).toFloat();

var emptyNDVI = ee.Image.constant(0)
  .rename('NDVI')
  .toFloat()
  .updateMask(emptyMask);

var emptyRatio = ee.Image.constant(0)
  .rename('ET_PET')
  .toFloat()
  .updateMask(emptyMask);

var emptyMetrics = ee.Image.cat([
  emptyNDVI,
  emptyRatio
]).toFloat();

// ============================================================
// 7. CALCULATE METRICS FOR A PERIOD
// ============================================================

// Period metrics:
// 1. Mean quality-screened NDVI.
// 2. Sum of ET divided by sum of PET.
//
// Using the ratio of accumulated ET/PET avoids treating every
// 8-day ratio as equally representative.

function calculatePeriodMetrics(year) {
  year = ee.Number(year);

  var periodStart = ee.Date.fromYMD(year, 1, 1);
  var periodEnd = ee.Date.fromYMD(year, 10, 26);

  var ndviCol = ndviDataset
    .filterDate(periodStart, periodEnd)
    .map(prepareNDVI);

  var etCol = etDataset
    .filterDate(periodStart, periodEnd)
    .map(prepareET);

  var ndviCount = ndviCol.size();
  var etCount = etCol.size();

  var ndviMean = ee.Image(ee.Algorithms.If(
    ndviCount.gt(0),
    ndviCol.mean().rename('NDVI').toFloat(),
    emptyNDVI
  ));

  var etSum = ee.Image(ee.Algorithms.If(
    etCount.gt(0),
    etCol.select('ET').sum().rename('ET').toFloat(),
    ee.Image.constant(0).rename('ET').toFloat()
      .updateMask(emptyMask)
  ));

  var petSum = ee.Image(ee.Algorithms.If(
    etCount.gt(0),
    etCol.select('PET').sum().rename('PET').toFloat(),
    ee.Image.constant(0).rename('PET').toFloat()
      .updateMask(emptyMask)
  ));

  var ratio = etSum
    .divide(petSum)
    .updateMask(petSum.gt(0))
    .rename('ET_PET')
    .toFloat();

  // Ensure the two bands always have consistent names and types.
  var metrics = ee.Image.cat([
    ndviMean.rename('NDVI').toFloat(),
    ratio.rename('ET_PET').toFloat()
  ]).toFloat();

  // If either dataset has no images, use a fully masked fallback
  // for the period so the historical collection remains homogeneous.
  var periodHasData = ndviCount.gt(0).and(etCount.gt(0));

  metrics = ee.Image(ee.Algorithms.If(
    periodHasData,
    metrics,
    emptyMetrics
  ));

  return metrics.set({
    'year': year,
    'system:time_start': periodStart.millis(),
    'NDVI_image_count': ndviCount,
    'ET_image_count': etCount
  });
}

// ============================================================
// 8. TARGET PERIOD — 2026
// ============================================================

var targetMetrics = calculatePeriodMetrics(2026);

var currentNDVI = targetMetrics
  .select('NDVI')
  .clip(roi);

var currentETPET = targetMetrics
  .select('ET_PET')
  .clip(roi);

print('Target NDVI image count:',
  ndviDataset.filterDate(startDate, endDate).size());

print('Target ET/PET image count:',
  etDataset.filterDate(startDate, endDate).size());

print('Target-period metrics:', targetMetrics);

// Latest image dates help check data availability.
var latestNDVI = ee.Image(
  ndviDataset.filterDate(startDate, endDate)
    .sort('system:time_start', false).first()
);

var latestET = ee.Image(
  etDataset.filterDate(startDate, endDate)
    .sort('system:time_start', false).first()
);

print(
  'Latest NDVI composite start date:',
  ee.Date(latestNDVI.get('system:time_start')).format('YYYY-MM-dd')
);

print(
  'Latest ET/PET composite start date:',
  ee.Date(latestET.get('system:time_start')).format('YYYY-MM-dd')
);

// ============================================================
// 9. HISTORICAL ANNUAL METRICS — 2001–2025
// ============================================================

var years = ee.List.sequence(
  baselineStartYear,
  baselineEndYear
);

var historicalMetrics = ee.ImageCollection.fromImages(
  years.map(function(year) {
    return calculatePeriodMetrics(year);
  })
);

print('Historical baseline image count:', historicalMetrics.size());

print(
  'Example historical annual metrics:',
  historicalMetrics.first()
);

print(
  'Historical metric band names:',
  ee.Image(historicalMetrics.first()).bandNames()
);

// ============================================================
// 10. HISTORICAL MEAN AND STANDARD DEVIATION
// ============================================================

var ndviMean = historicalMetrics
  .select('NDVI')
  .mean()
  .rename('NDVI_clim_mean')
  .toFloat();

var ndviStd = historicalMetrics
  .select('NDVI')
  .reduce(ee.Reducer.stdDev())
  .rename('NDVI_clim_std')
  .toFloat();

var etpetMean = historicalMetrics
  .select('ET_PET')
  .mean()
  .rename('ET_PET_clim_mean')
  .toFloat();

var etpetStd = historicalMetrics
  .select('ET_PET')
  .reduce(ee.Reducer.stdDev())
  .rename('ET_PET_clim_std')
  .toFloat();

// ============================================================
// 11. CALCULATE STANDARDIZED ANOMALIES
// ============================================================

var validNDVIStd = ndviStd.gt(0);
var validETPETStd = etpetStd.gt(0);

var zNDVI = currentNDVI
  .subtract(ndviMean)
  .divide(ndviStd)
  .updateMask(validNDVIStd)
  .rename('Z_NDVI')
  .toFloat();

var zETPET = currentETPET
  .subtract(etpetMean)
  .divide(etpetStd)
  .updateMask(validETPETStd)
  .rename('Z_ET_PET')
  .toFloat();

// Both inputs must be valid to calculate the composite.
var validComposite = validNDVIStd.and(validETPETStd);


 // ============================================================
 // 12. DROUGHT SEVERITY INDEX — NEGATIVE VALUES = MORE SEVERE
 // ============================================================

// Negative NDVI and ET/PET anomalies contribute to negative DSI.
var dsi = zNDVI.add(zETPET)
  .multiply(0.5)
  .updateMask(validComposite)
  .rename('DSI')
  .clip(roi)
  .toFloat();

print('DSI image:', dsi);
print('DSI band names:', dsi.bandNames());

// ============================================================
// 13. DSI VISUALIZATION — DARKER = MORE SEVERE DROUGHT
// ============================================================

// Display range: -2 (higher severity) to +1 (lower severity).
// Dark red = severe negative anomaly.
// Light yellow = lower severity / near-normal to positive anomaly.
var dsiPalette = [
  '67000D', // -2.00: very high drought severity
  'A50F15',
  'CB181D',
  'EF3B2C',
  'FB6A4A',
  'FC9272',
  'FCAE91',
  'FEE0D2',
  'FFF5F0',
  'FFFFCC'  // +1.00: lower severity
];

var dsiMin = -2;
var dsiMax = 1;

Map.addLayer(
  dsi,
  {
    min: dsiMin,
    max: dsiMax,
    palette: dsiPalette
  },
  'DSI — Indonesia 2026 (dark = severe drought)'
);

// ============================================================
// 14. SIMPLE DSI LEGEND — THREE DROUGHT CLASSES
// ============================================================

var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '10px 14px',
    width: '190px'
  }
});

legend.add(ui.Label({
  value: 'Drought Severity Index (DSI)',
  style: {
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0 0 8px 0'
  }
}));

// Three simple classes matching the DSI map colours
var legendItems = [
  {label: 'Severe Drought', color: '#67000D'},
  {label: 'Mild Drought',   color: '#FC9272'},
  {label: 'Normal',         color: '#FFFFCC'}
];

legendItems.forEach(function(item) {
  var colorBox = ui.Label('', {
    backgroundColor: item.color,
    padding: '8px',
    margin: '0 8px 5px 0'
  });

  var description = ui.Label(item.label, {
    fontSize: '12px',
    margin: '2px 0 5px 0'
  });

  legend.add(ui.Panel(
    [colorBox, description],
    ui.Panel.Layout.Flow('horizontal')
  ));
});

Map.add(legend);
 // ============================================================
 // 15. SUMMARY STATISTICS — OPTIMIZED TO AVOID TIMEOUTS
 // ============================================================

// Use a coarser scale for country-wide summaries.
// This does not change the DSI map layer itself.
var summaryScale = 5000;

// Summary statistics: minimum, maximum, mean, standard deviation.
var stats = dsi.reduceRegion({
  reducer: ee.Reducer.minMax()
    .combine({
      reducer2: ee.Reducer.mean(),
      sharedInputs: true
    })
    .combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
  geometry: roi,
  scale: summaryScale,
  bestEffort: true,
  maxPixels: 1e13,
  tileScale: 8
});

print('DSI summary statistics (coarser-scale estimate):', stats);

// Estimate area with positive DSI (drier-than-usual signal).
var positiveAreaImage = ee.Image.pixelArea()
  .updateMask(dsi.gt(0))
  .rename('area_m2');

var positiveAreaStats = positiveAreaImage.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: roi,
  scale: summaryScale,
  bestEffort: true,
  maxPixels: 1e13,
  tileScale: 8
});

print(
  'Estimated area with positive DSI (m²):',
  positiveAreaStats
);

var positiveAreaKm2 = ee.Number(
  positiveAreaStats.get('area_m2', 0)
).divide(1e6);

print(
  'Estimated area with positive DSI (km²):',
  positiveAreaKm2
);


// ============================================================
// 16. OPTIONAL EXPORT TO GOOGLE DRIVE
// ============================================================

Export.image.toDrive({
  image: dsi,
  description: 'Indonesia_DSI_2026',
  folder: 'GEE_Drought_Indices',
  fileNamePrefix: 'Indonesia_DSI_Jan_Oct_2026',
  region: roi,
  scale: analysisScale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});
