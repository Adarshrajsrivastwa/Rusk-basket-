const logger = require('./logger');

const queryLogger = (query, executionTime) => {
  if (process.env.QUERY_LOG_ENABLED === 'true') {
    const logData = {
      query: query.trim(),
      executionTime: `${executionTime}ms`,
      timestamp: new Date().toISOString(),
    };
    
    if (executionTime > parseInt(process.env.SLOW_QUERY_THRESHOLD || 1000)) {
      logger.warn('Slow query detected:', logData);
    } else if (process.env.QUERY_LOG_LEVEL === 'debug') {
      logger.debug('Query executed:', logData);
    }
  }
};

const sanitizeQuery = (query) => {
  if (typeof query !== 'string') {
    return JSON.stringify(query);
  }
  return query.replace(/\s+/g, ' ').trim();
};

const buildQuery = (filters = {}) => {
  const query = {};
  
  Object.keys(filters).forEach((key) => {
    const value = filters[key];
    
    if (value === undefined || value === null || value === '') {
      return;
    }
    
    if (key.includes('_min')) {
      const field = key.replace('_min', '');
      query[field] = { ...query[field], $gte: parseFloat(value) };
    } else if (key.includes('_max')) {
      const field = key.replace('_max', '');
      query[field] = { ...query[field], $lte: parseFloat(value) };
    } else if (key.includes('_like') || key.includes('_search')) {
      const field = key.replace(/_like|_search/, '');
      query[field] = { $regex: value, $options: 'i' };
    } else if (key === 'search') {
      query.$text = { $search: value };
    } else if (Array.isArray(value)) {
      query[key] = { $in: value };
    } else {
      query[key] = value;
    }
  });
  
  return query;
};

const buildSort = (sortBy = 'createdAt', sortOrder = 'desc') => {
  const order = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
  return { [sortBy]: order };
};

const buildPagination = (page = 1, limit = 10) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const skip = (pageNum - 1) * limitNum;
  
  return {
    skip: Math.max(0, skip),
    limit: Math.min(100, Math.max(1, limitNum)),
    page: pageNum,
  };
};

const executeQuery = async (model, queryOptions = {}) => {
  const startTime = Date.now();
  
  try {
    const {
      filters = {},
      sort = { createdAt: -1 },
      pagination = { skip: 0, limit: 10 },
      populate = [],
      select = null,
    } = queryOptions;
    
    const query = buildQuery(filters);
    const sortObj = typeof sort === 'string' ? buildSort(sort) : sort;
    const paginationObj = typeof pagination === 'object' && pagination.skip !== undefined
      ? pagination
      : buildPagination(pagination.page, pagination.limit);
    
    let queryBuilder = model.find(query);
    
    if (select) {
      queryBuilder = queryBuilder.select(select);
    }
    
    if (populate.length > 0) {
      populate.forEach((pop) => {
        queryBuilder = queryBuilder.populate(pop);
      });
    }
    
    queryBuilder = queryBuilder.sort(sortObj);
    
    const [data, total] = await Promise.all([
      queryBuilder.skip(paginationObj.skip).limit(paginationObj.limit).lean(),
      model.countDocuments(query),
    ]);
    
    const executionTime = Date.now() - startTime;
    
    if (process.env.QUERY_LOG_ENABLED === 'true') {
      queryLogger(JSON.stringify({ query, sort: sortObj }), executionTime);
    }
    
    return {
      data,
      pagination: {
        page: paginationObj.page,
        limit: paginationObj.limit,
        total,
        pages: Math.ceil(total / paginationObj.limit),
      },
      executionTime: `${executionTime}ms`,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Query execution error:', { error: error.message, executionTime: `${executionTime}ms` });
    throw error;
  }
};

const optimizeQuery = (query) => {
  const optimized = { ...query };
  
  if (optimized.select && typeof optimized.select === 'string') {
    optimized.select = optimized.select.split(' ').filter(Boolean);
  }
  
  if (optimized.populate && typeof optimized.populate === 'string') {
    optimized.populate = optimized.populate.split(',').map((p) => p.trim());
  }
  
  return optimized;
};

module.exports = {
  queryLogger,
  sanitizeQuery,
  buildQuery,
  buildSort,
  buildPagination,
  executeQuery,
  optimizeQuery,
};

