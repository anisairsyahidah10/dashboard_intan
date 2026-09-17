(function attachStatusEngine(globalScope) {
  const DEFAULT_MONITORING_DATE = '2026-09-17';

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  function asPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function isCompleted(task) {
    return String(task.status || '').toUpperCase() === 'SELESAI';
  }

  function hasStarted(task) {
    const status = String(task.status || '').toUpperCase();
    return isCompleted(task) || status === 'DALAM PELAKSANAAN' || Boolean(task.laksanaMula || task.laksanaTamat) || asPercent(task.peratusSemasa) > 0;
  }

  function getExecutionState(tasks, monitoringDate = DEFAULT_MONITORING_DATE) {
    if (!tasks.length) return 'BELUM MULA';
    if (tasks.every(isCompleted)) return 'SELESAI';
    if (tasks.some(hasStarted)) return 'AKTIF';

    const asOf = parseDate(monitoringDate);
    const hasLateUnstarted = tasks.some(task => {
      const plannedStart = parseDate(task.sasaranMula);
      return plannedStart && asOf && plannedStart < asOf && !hasStarted(task);
    });
    return hasLateUnstarted ? 'LEWAT BELUM MULA' : 'BELUM MULA';
  }

  function latestCurveSnapshot(tasks, activeYear, monitoringDate) {
    const curve = globalScope.buildDynamicSCurve(tasks, monitoringDate, activeYear);
    let index = -1;
    curve.actual.forEach((value, position) => {
      if (value !== null && value !== undefined) index = position;
    });
    const planned = index >= 0 ? asPercent(curve.planned[index]) : null;
    const actual = index >= 0 ? asPercent(curve.actual[index]) : null;
    return {
      curve,
      planned,
      actual,
      variance: planned === null || actual === null ? null : actual - planned,
    };
  }

  function evaluateInitiativePerformance(tasks, options = {}) {
    const activeYear = options.activeYear || 'ALL';
    const monitoringDate = options.monitoringDate || DEFAULT_MONITORING_DATE;
    const asOf = parseDate(monitoringDate);
    const total = tasks.length;
    const completed = tasks.filter(isCompleted).length;
    const started = tasks.filter(hasStarted).length;
    const missingCount = tasks.filter(task => !parseDate(task.sasaranMula) || !parseDate(task.sasaranTamat)).length;
    const missingRatio = total ? missingCount / total : 0;
    const overdueCount = tasks.filter(task => {
      const plannedEnd = parseDate(task.sasaranTamat);
      return plannedEnd && asOf && plannedEnd < asOf && !isCompleted(task);
    }).length;
    const overdueRatio = total ? overdueCount / total : 0;
    const snapshot = latestCurveSnapshot(tasks, activeYear, monitoringDate);
    const execution = getExecutionState(tasks, monitoringDate);

    const performance = classifyInitiativePerformance({
      total,
      completed,
      started,
      execution,
      missingRatio,
      curveBasis: snapshot.curve.basis,
      variance: snapshot.variance,
      overdueCount,
      overdueRatio,
    });

    return {
      performance,
      execution,
      total,
      completed,
      started,
      overdueCount,
      overdueRatio,
      missingCount,
      missingRatio,
      planned: snapshot.planned,
      actual: snapshot.actual,
      variance: snapshot.variance,
      curveBasis: snapshot.curve.basis,
    };
  }

  function classifyInitiativePerformance(metrics) {
    if (metrics.total === 0) return 'PERANCANGAN';
    if (metrics.completed === metrics.total) return 'SELESAI SEPENUHNYA';
    if (metrics.curveBasis === 'no-dates' || metrics.missingRatio > 0.20) return 'DATA TIDAK LENGKAP';
    if (metrics.started === 0 && metrics.execution === 'BELUM MULA') return 'PERANCANGAN';
    if (metrics.variance === null || metrics.variance === undefined) return 'DATA TIDAK LENGKAP';
    if (metrics.variance < -15 || metrics.overdueRatio > 0.20) return 'KRITIKAL';
    if (metrics.variance < -5 || metrics.overdueCount > 0 || metrics.execution === 'LEWAT BELUM MULA') return 'PERLU PERHATIAN';
    return 'ON TRACK';
  }

  function evaluatePortfolioPerformance(evaluations) {
    const scoped = evaluations.filter(item => item.total > 0);
    const startedCount = scoped.filter(item => item.started > 0).length;
    const measurable = scoped.filter(item => item.variance !== null);
    const variance = measurable.length > 0
      ? measurable.reduce((sum, item) => sum + item.variance, 0) / measurable.length
      : null;
    const criticalCount = scoped.filter(item => item.performance === 'KRITIKAL').length;
    const incompleteCount = scoped.filter(item => item.performance === 'DATA TIDAK LENGKAP').length;
    const criticalRatio = scoped.length ? criticalCount / scoped.length : 0;
    const incompleteRatio = scoped.length ? incompleteCount / scoped.length : 0;

    let status = 'PERANCANGAN';
    if (scoped.length > 0 && startedCount > 0) {
      if (incompleteRatio > 0.25 || variance === null) status = 'DATA TIDAK MENCUKUPI';
      else if (variance < -15 || criticalRatio > 0.25) status = 'KRITIKAL';
      else if (variance < -5 || criticalCount > 0) status = 'PERLU PERHATIAN';
      else status = 'MEMUASKAN';
    }

    return { status, variance, criticalCount, incompleteCount, startedCount, scopedCount: scoped.length };
  }

  const STATUS_STYLES = {
    'MEMUASKAN': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'ON TRACK': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'SELESAI': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'SELESAI SEPENUHNYA': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'AKTIF': 'bg-blue-100 text-blue-800 border-blue-200',
    'PERLU PERHATIAN': 'bg-amber-100 text-amber-800 border-amber-200',
    'LEWAT BELUM MULA': 'bg-orange-100 text-orange-800 border-orange-200',
    'KRITIKAL': 'bg-red-100 text-red-800 border-red-200',
    'DATA TIDAK LENGKAP': 'bg-purple-100 text-purple-800 border-purple-200',
    'DATA TIDAK MENCUKUPI': 'bg-purple-100 text-purple-800 border-purple-200',
    'BELUM MULA': 'bg-slate-100 text-slate-700 border-slate-200',
    'PERANCANGAN': 'bg-slate-100 text-slate-700 border-slate-200',
  };

  function statusStyle(status) {
    return STATUS_STYLES[status] || STATUS_STYLES['PERANCANGAN'];
  }

  Object.assign(globalScope, {
    STATUS_ENGINE_MONITORING_DATE: DEFAULT_MONITORING_DATE,
    evaluateInitiativePerformance,
    evaluatePortfolioPerformance,
    classifyInitiativePerformance,
    getExecutionState,
    statusStyle,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
