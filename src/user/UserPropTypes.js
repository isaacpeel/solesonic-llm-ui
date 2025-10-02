import PropTypes from "prop-types";

const modelProps = PropTypes.propTypes = {
    selectedModel: PropTypes.shape(
        {
            name: PropTypes.string.isRequired,
            size: PropTypes.number.isRequired,
            model: PropTypes.string.isRequired,
            censored: PropTypes.bool.isRequired,
            embedding: PropTypes.bool.isRequired,
            vision: PropTypes.bool.isRequired,
            ollamaModel: PropTypes.shape({
                details: PropTypes.shape({
                    parentModel: PropTypes.string,
                    format: PropTypes.string.isRequired,
                    family: PropTypes.string.isRequired,
                    families: PropTypes.array.isRequired,
                    parameter_size: PropTypes.string.isRequired,
                    quantization_level: PropTypes.string.isRequired,
                })
            })
        }
    )
}

export default modelProps;

