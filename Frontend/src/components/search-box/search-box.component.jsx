import "./search-box.styles.css";

const SearchBox = (props) => {
  const { onChange, placeholder } = props;
  console.log(placeholder);
  return (
    <div className="search-box">
      <input
        className="search-box"
        type="search"
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
};

export default SearchBox;
