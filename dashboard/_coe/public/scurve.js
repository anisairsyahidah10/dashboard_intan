(function attachDynamicSCurve(globalScope) {
  const MS_PER_DAY = 86400000;

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function durationDays(task, start, end) {
    const supplied = Number(task.tempohRancang) || 0;
    if (supplied > 0) return supplied;
    return Math.max(1, Math.round((end - start) / MS_PER_DAY) + 1);
  }

  function fractionAcross(start, end, point) {
    if (!start || !end || point < start) return 0;
    if (point >= end) return 1;
    const total = Math.max(MS_PER_DAY, end - start);
    return clamp((point - start) / total);
  }

  function endOfMonth(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  }

  function addMonths(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  }

  function monthSpan(start, end) {
    return ((end.getUTCFullYear() - start.getUTCFullYear()) * 12) + end.getUTCMonth() - start.getUTCMonth();
  }

  function formatPeriod(date, stepMonths) {
    const months = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogos', 'Sept', 'Okt', 'Nov', 'Dis'];
    if (stepMonths === 3) {
      return `S${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
    }
    return `${months[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
  }

  function currentTaskFraction(task) {
    if (task.status === 'SELESAI') return 1;

    const plannedWeight = Number(task.peratusRancang) || 0;
    const currentWeight = Number(task.peratusSemasa) || 0;
    if (plannedWeight > 0 && currentWeight > 0) {
      return clamp(currentWeight / plannedWeight);
    }

    const plannedDays = Number(task.tempohRancang) || 0;
    const completedDays = Number(task.tempohSelesai) || 0;
    if (plannedDays > 0 && completedDays > 0) {
      return clamp(completedDays / plannedDays);
    }
    return 0;
  }

  function actualFractionAt(task, point, asOf) {
    const actualStart = parseDate(task.laksanaMula);
    const actualEnd = parseDate(task.laksanaTamat);
    const currentFraction = currentTaskFraction(task);

    if (actualEnd) {
      if (actualStart) return fractionAcross(actualStart, actualEnd, point);
      return point >= actualEnd ? 1 : 0;
    }

    if (actualStart && currentFraction > 0) {
      if (point < actualStart) return 0;
      if (asOf <= actualStart) return point >= asOf ? currentFraction : 0;
      return clamp(((point - actualStart) / (asOf - actualStart)) * currentFraction, 0, currentFraction);
    }

    if (currentFraction > 0) return point >= asOf ? currentFraction : 0;
    return 0;
  }

  function buildDynamicSCurve(tasks, asOfText, selectedYear = 'ALL') {
    const asOf = parseDate(asOfText) || new Date();
    const year = selectedYear === 'ALL' ? null : Number(selectedYear);
    const yearStart = year ? new Date(Date.UTC(year, 0, 1)) : null;
    const yearEnd = year ? new Date(Date.UTC(year, 11, 31)) : null;
    const scheduled = (tasks || []).map((task) => {
      const originalStart = parseDate(task.sasaranMula);
      const originalEnd = parseDate(task.sasaranTamat);
      if (!originalStart || !originalEnd || originalEnd < originalStart) return null;
      if (year && (originalEnd < yearStart || originalStart > yearEnd)) return null;
      const start = year && originalStart < yearStart ? yearStart : originalStart;
      const end = year && originalEnd > yearEnd ? yearEnd : originalEnd;
      return { task, start, end, originalStart, originalEnd };
    }).filter(Boolean);

    if (!scheduled.length) {
      return {
        labels: ['Tiada tarikh sasaran'],
        planned: [0],
        actual: [null],
        basis: 'no-dates',
      };
    }

    const minStart = new Date(Math.min(...scheduled.map((item) => item.start.valueOf())));
    const maxEnd = new Date(Math.max(...scheduled.map((item) => item.end.valueOf())));
    const stepMonths = monthSpan(minStart, maxEnd) > 24 ? 3 : 1;
    const allHaveExcelWeight = scheduled.every(({ task }) => (Number(task.peratusRancang) || 0) > 0);

    const weighted = scheduled.map((item) => {
      const overlapDays = Math.max(1, Math.round((item.end - item.start) / MS_PER_DAY) + 1);
      const originalDays = Math.max(1, Math.round((item.originalEnd - item.originalStart) / MS_PER_DAY) + 1);
      return {
        ...item,
        weight: allHaveExcelWeight
          ? Number(item.task.peratusRancang) * (year ? (overlapDays / originalDays) : 1)
          : (year ? overlapDays : durationDays(item.task, item.originalStart, item.originalEnd)),
      };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;

    const points = [minStart];
    let cursor = endOfMonth(minStart);
    while (cursor < maxEnd) {
      points.push(cursor);
      cursor = endOfMonth(addMonths(cursor, stepMonths));
    }
    points.push(maxEnd);
    if (asOf >= minStart && asOf <= maxEnd) points.push(asOf);

    const uniquePoints = [...new Map(points.map((date) => [date.toISOString().slice(0, 10), date])).values()]
      .sort((a, b) => a - b);

    const planned = uniquePoints.map((point) => {
      const earned = weighted.reduce((sum, item) => (
        sum + (item.weight * fractionAcross(item.start, item.end, point))
      ), 0);
      return Number(((earned / totalWeight) * 100).toFixed(1));
    });

    const actual = uniquePoints.map((point) => {
      if (point > asOf) return null;
      const earned = weighted.reduce((sum, item) => (
        sum + (item.weight * actualFractionAt(item.task, point, asOf))
      ), 0);
      return Number(((earned / totalWeight) * 100).toFixed(1));
    });

    return {
      labels: uniquePoints.map((date) => formatPeriod(date, stepMonths)),
      planned,
      actual,
      basis: allHaveExcelWeight ? 'excel-weight' : 'duration-weight',
    };
  }

  function buildPortfolioSCurve(initiativeTaskSets, asOfText, selectedYear = 'ALL') {
    const asOf = parseDate(asOfText) || new Date();
    const year = selectedYear === 'ALL' ? null : Number(selectedYear);
    const yearStart = year ? new Date(Date.UTC(year, 0, 1)) : null;
    const yearEnd = year ? new Date(Date.UTC(year, 11, 31)) : null;

    const initiatives = (initiativeTaskSets || []).map((tasks) => {
      const scheduled = (tasks || []).map((task) => {
        const originalStart = parseDate(task.sasaranMula);
        const originalEnd = parseDate(task.sasaranTamat);
        if (!originalStart || !originalEnd || originalEnd < originalStart) return null;
        if (year && (originalEnd < yearStart || originalStart > yearEnd)) return null;
        const start = year && originalStart < yearStart ? yearStart : originalStart;
        const end = year && originalEnd > yearEnd ? yearEnd : originalEnd;
        return { task, start, end, originalStart, originalEnd };
      }).filter(Boolean);

      if (!scheduled.length) return null;
      const allHaveExcelWeight = scheduled.every(({ task }) => (Number(task.peratusRancang) || 0) > 0);
      const weighted = scheduled.map((item) => {
        const overlapDays = Math.max(1, Math.round((item.end - item.start) / MS_PER_DAY) + 1);
        const originalDays = Math.max(1, Math.round((item.originalEnd - item.originalStart) / MS_PER_DAY) + 1);
        return {
          ...item,
          weight: allHaveExcelWeight
            ? Number(item.task.peratusRancang) * (year ? (overlapDays / originalDays) : 1)
            : (year ? overlapDays : durationDays(item.task, item.originalStart, item.originalEnd)),
        };
      });
      return {
        weighted,
        totalWeight: weighted.reduce((sum, item) => sum + item.weight, 0) || 1,
      };
    }).filter(Boolean);

    if (!initiatives.length) {
      return {
        labels: ['Tiada tarikh sasaran'],
        planned: [0],
        actual: [null],
        basis: 'no-dates',
        includedInitiatives: 0,
      };
    }

    const allItems = initiatives.flatMap((initiative) => initiative.weighted);
    const minStart = new Date(Math.min(...allItems.map((item) => item.start.valueOf())));
    const maxEnd = new Date(Math.max(...allItems.map((item) => item.end.valueOf())));
    const stepMonths = monthSpan(minStart, maxEnd) > 24 ? 3 : 1;
    const points = [minStart];
    let cursor = endOfMonth(minStart);
    while (cursor < maxEnd) {
      points.push(cursor);
      cursor = endOfMonth(addMonths(cursor, stepMonths));
    }
    points.push(maxEnd);
    if (asOf >= minStart && asOf <= maxEnd) points.push(asOf);

    const uniquePoints = [...new Map(points.map((date) => [date.toISOString().slice(0, 10), date])).values()]
      .sort((a, b) => a - b);

    const averageAt = (point, actualMode) => {
      const total = initiatives.reduce((portfolioSum, initiative) => {
        const earned = initiative.weighted.reduce((sum, item) => {
          const fraction = actualMode
            ? actualFractionAt(item.task, point, asOf)
            : fractionAcross(item.start, item.end, point);
          return sum + (item.weight * fraction);
        }, 0);
        return portfolioSum + (earned / initiative.totalWeight);
      }, 0);
      return Number(((total / initiatives.length) * 100).toFixed(1));
    };

    return {
      labels: uniquePoints.map((date) => formatPeriod(date, stepMonths)),
      planned: uniquePoints.map((point) => averageAt(point, false)),
      actual: uniquePoints.map((point) => point > asOf ? null : averageAt(point, true)),
      basis: 'equal-initiative',
      includedInitiatives: initiatives.length,
    };
  }

  globalScope.buildDynamicSCurve = buildDynamicSCurve;
  globalScope.buildPortfolioSCurve = buildPortfolioSCurve;
})(typeof window !== 'undefined' ? window : globalThis);
