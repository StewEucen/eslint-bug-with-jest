'use strict'

module.exports = function doubleValue (
  value,
  ignore
) {
  if (ignore) {
    return value
    }

  return value + value
}
