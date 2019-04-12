'use strict'

/**
 * Formats a date/time for displaying to the user.
 * @param {number} time The date/time, as a UNIX timestamp.
 * @returns {string} The formatted date/time.
 */
function formatTime(time) {
	return new Date(time)
		.toLocaleString(undefined, {
			day: '2-digit',
			hour: '2-digit',
			hour12: false,
			minute: '2-digit',
			month: '2-digit',
			year: 'numeric'
		})
}

export default formatTime
